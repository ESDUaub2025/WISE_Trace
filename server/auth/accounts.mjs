// Account storage: who exists, their password and authenticator state.
// Tables live in the wise_auth schema (server/migrations/202611110094_account_sessions.sql).
// Roles, cooperative and PIN stay in the business tables (public.membership, private.user_pin).
import { randomUUID } from 'node:crypto';
import { authPolicy, syntheticEmail, usernamePattern } from './policy.mjs';
import { assertPasswordAllowed, hashPassword } from './passwords.mjs';
import { AuthError } from './errors.mjs';

export function createAccounts(pool) {
  async function inTransaction(work) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const result = await work(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  const accountColumns = `u.id, u.email, u.email_confirmed_at, c.password_hash, c.failed_attempts, c.blocked_until,
    c.totp_secret, c.totp_confirmed_at, c.totp_last_step`;

  /** Finds an account by username (staff and registered members) or by email address. */
  async function findByIdentifier(identifier) {
    const value = String(identifier ?? '')
      .trim()
      .toLowerCase();
    if (!value || value.length > 254) return null;
    const byEmail = value.includes('@');
    if (!byEmail && !usernamePattern.test(value)) return null;
    const result = await pool.query(
      `select ${accountColumns}
         from wise_auth.users u join wise_auth.credential c on c.user_id = u.id
        where u.deleted_at is null and ${byEmail ? 'u.email = $1' : 'u.id = wise_auth.account_for_username($1)'}`,
      [value],
    );
    return result.rows[0] ?? null;
  }

  async function findById(id) {
    const result = await pool.query(
      `select ${accountColumns} from wise_auth.users u join wise_auth.credential c on c.user_id = u.id
        where u.id = $1 and u.deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  /** Creates an account. Staff accounts pass a username and get a placeholder address. */
  async function create({ username, email, password, displayName = '', confirmed = false }) {
    assertPasswordAllowed(password);
    const address = (email ?? syntheticEmail(username)).trim().toLowerCase();
    const id = randomUUID();
    const passwordHash = await hashPassword(password);
    try {
      await inTransaction(async (client) => {
        await client.query(
          `insert into wise_auth.users(id, email, email_confirmed_at, raw_user_meta_data) values($1, $2, $3, $4)`,
          [id, address, confirmed ? new Date() : null, JSON.stringify({ display_name: displayName })],
        );
        await client.query('insert into wise_auth.credential(user_id, password_hash) values($1, $2)', [
          id,
          passwordHash,
        ]);
      });
    } catch (error) {
      if (error.code === '23505') throw new AuthError('accountExists', 409);
      throw error;
    }
    return { id, email: address };
  }

  /** Removes an account that never received a membership (used to undo a failed provisioning). */
  async function remove(id) {
    await pool.query('delete from wise_auth.users where id = $1', [id]);
  }

  /** Sets a new password, clears any pause and signs the person out everywhere (optionally keeping one device). */
  async function setPassword(id, password, { keepDeviceSession = null } = {}) {
    assertPasswordAllowed(password);
    const passwordHash = await hashPassword(password);
    const known = await pool.query('select 1 from wise_auth.users where id = $1 and deleted_at is null', [id]);
    if (!known.rowCount) throw new AuthError('accountUnavailable', 404);
    await inTransaction(async (client) => {
      await client.query(
        `insert into wise_auth.credential(user_id, password_hash) values($1, $2)
         on conflict(user_id) do update set password_hash = excluded.password_hash, password_changed_at = now(),
           failed_attempts = 0, blocked_until = null`,
        [id, passwordHash],
      );
      await client.query(
        'delete from wise_auth.device_login where user_id = $1 and ($2::uuid is null or device_session_id <> $2)',
        [id, keepDeviceSession],
      );
    });
  }

  async function storePasswordHash(id, passwordHash) {
    await pool.query('update wise_auth.credential set password_hash = $2 where user_id = $1', [id, passwordHash]);
  }

  /** Counts a wrong password or code; pauses the account once the policy limit is reached. */
  async function recordFailure(id) {
    const { maxFailures, pauseMs } = authPolicy.lockout;
    await pool.query(
      `update wise_auth.credential
          set failed_attempts = failed_attempts + 1,
              blocked_until = case when failed_attempts + 1 >= $2 then now() + ($3 || ' milliseconds')::interval else blocked_until end
        where user_id = $1`,
      [id, maxFailures, String(pauseMs)],
    );
  }

  async function clearFailures(id) {
    await pool.query('update wise_auth.credential set failed_attempts = 0, blocked_until = null where user_id = $1', [
      id,
    ]);
  }

  /** Whether the person may use the system, and the roles that decide if a second factor is required. */
  async function standing(id) {
    const result = await pool.query('select allowed, roles from wise_auth.standing($1)', [id]);
    return result.rows[0];
  }

  async function saveTotpSecret(id, sealedSecret) {
    await pool.query(
      'update wise_auth.credential set totp_secret = $2, totp_confirmed_at = null, totp_last_step = null where user_id = $1',
      [id, sealedSecret],
    );
  }

  /** Accepts a time step once: a concurrent second use of the same code updates no row. */
  async function acceptTotpStep(id, step) {
    const result = await pool.query(
      `update wise_auth.credential
          set totp_last_step = $2, totp_confirmed_at = coalesce(totp_confirmed_at, now()), failed_attempts = 0, blocked_until = null
        where user_id = $1 and coalesce(totp_last_step, -1) < $2`,
      [id, step],
    );
    return result.rowCount === 1;
  }

  /** Operator recovery: the person sets up a new authenticator at their next sign-in. */
  async function clearTotp(id) {
    await inTransaction(async (client) => {
      await client.query(
        'update wise_auth.credential set totp_secret = null, totp_confirmed_at = null, totp_last_step = null where user_id = $1',
        [id],
      );
      await client.query('delete from wise_auth.device_login where user_id = $1', [id]);
    });
  }

  async function confirmEmail(id) {
    await pool.query(
      'update wise_auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1',
      [id],
    );
  }

  /** Data-subject request (PRD §12.2): the identity is emptied and can never sign in; records keep the id. */
  async function anonymize(id) {
    await inTransaction(async (client) => {
      const updated = await client.query(
        `update wise_auth.users set email = $2, raw_user_meta_data = '{}', deleted_at = now() where id = $1`,
        [id, `anon_${id.replaceAll('-', '')}@users.wise.invalid`],
      );
      if (!updated.rowCount) throw new AuthError('accountUnavailable', 404);
      await client.query('delete from wise_auth.credential where user_id = $1', [id]);
      await client.query('delete from wise_auth.device_login where user_id = $1', [id]);
      await client.query('delete from wise_auth.email_token where user_id = $1', [id]);
    });
  }

  return {
    findByIdentifier,
    findById,
    create,
    remove,
    setPassword,
    storePasswordHash,
    recordFailure,
    clearFailures,
    standing,
    saveTotpSecret,
    acceptTotpStep,
    clearTotp,
    confirmEmail,
    anonymize,
  };
}
