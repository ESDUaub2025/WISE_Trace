// Device sessions: one HttpOnly cookie per browser, and under it one sign-in per person.
// This is what lets several people share a phone (PRD FR-AUTH-03) while each request still
// names exactly one acting person (the X-Wise-User header, checked against the sign-ins below).
// Only a SHA-256 hash of the cookie value is stored, so a database copy cannot be replayed as a cookie.
import { createHash, randomBytes } from 'node:crypto';
import { authPolicy } from './policy.mjs';

const hashToken = (token) => createHash('sha256').update(token).digest('base64url');

export function createSessions(pool, { secureCookies }) {
  const cookieName = secureCookies ? authPolicy.cookie.secureName : authPolicy.cookie.plainName;

  function readToken(cookieHeader) {
    for (const part of String(cookieHeader ?? '').split(';')) {
      const at = part.indexOf('=');
      if (at > 0 && part.slice(0, at).trim() === cookieName) return part.slice(at + 1).trim();
    }
    return null;
  }

  function cookie(token, maxAgeSeconds = authPolicy.cookie.maxAgeSeconds) {
    // SameSite=Lax plus the server's exact-Origin check on every write protects against cross-site requests.
    const attributes = [`${cookieName}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
    if (secureCookies) attributes.push('Secure');
    return attributes.join('; ');
  }

  const clearingCookie = () => cookie('', 0);

  /** The device session for a request's cookie, or null. */
  async function find(cookieHeader) {
    const token = readToken(cookieHeader);
    if (!token) return null;
    const result = await pool.query(
      'update wise_auth.device_session set last_seen_at = now() where token_hash = $1 returning id',
      [hashToken(token)],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Starts a device session, or gives an existing one a fresh cookie value.
   * A fresh value on every password sign-in prevents session fixation (OWASP Session Management Cheat Sheet).
   */
  async function issue(existingId, userAgent) {
    const token = randomBytes(32).toString('base64url');
    const result = existingId
      ? await pool.query(
          'update wise_auth.device_session set token_hash = $2, last_seen_at = now() where id = $1 returning id',
          [existingId, hashToken(token)],
        )
      : await pool.query('insert into wise_auth.device_session(token_hash, user_agent) values($1, $2) returning id', [
          hashToken(token),
          String(userAgent ?? '').slice(0, 300),
        ]);
    return { id: result.rows[0].id, setCookie: cookie(token) };
  }

  /** Records a person as signed in on this device and drops the oldest sign-ins beyond the device limit. */
  async function signIn(deviceSessionId, userId, { privileged }) {
    const lifetime = privileged ? authPolicy.login.privilegedMs : authPolicy.login.idleMs;
    await pool.query(
      `insert into wise_auth.device_login(device_session_id, user_id, expires_at)
       values($1, $2, now() + ($3 || ' milliseconds')::interval)
       on conflict(device_session_id, user_id) do update
         set signed_in_at = now(), last_used_at = now(), expires_at = excluded.expires_at, second_factor_at = null`,
      [deviceSessionId, userId, String(lifetime)],
    );
    await pool.query(
      `delete from wise_auth.device_login
        where device_session_id = $1 and user_id in (
          select user_id from wise_auth.device_login where device_session_id = $1
           order by last_used_at desc offset $2)`,
      [deviceSessionId, authPolicy.login.maxPeoplePerDevice],
    );
  }

  /** Current sign-ins on a device. Expired rows are ignored here and removed by the worker-free sweep below. */
  async function logins(deviceSessionId) {
    const result = await pool.query(
      `select l.user_id, l.signed_in_at, l.last_used_at, l.expires_at, l.second_factor_at, u.email
         from wise_auth.device_login l join wise_auth.users u on u.id = l.user_id
        where l.device_session_id = $1 and l.expires_at > now() and u.deleted_at is null
        order by l.last_used_at desc`,
      [deviceSessionId],
    );
    return result.rows;
  }

  /** Keeps an in-use, non-privileged sign-in alive. Privileged sign-ins end at their fixed time. */
  async function touch(deviceSessionId, login, { privileged }) {
    if (Date.now() - new Date(login.last_used_at).getTime() < authPolicy.login.renewEveryMs) return;
    await pool.query(
      `update wise_auth.device_login
          set last_used_at = now(),
              expires_at = case when $3 then expires_at else now() + ($4 || ' milliseconds')::interval end
        where device_session_id = $1 and user_id = $2`,
      [deviceSessionId, login.user_id, privileged, String(authPolicy.login.idleMs)],
    );
  }

  async function markSecondFactor(deviceSessionId, userId) {
    await pool.query(
      'update wise_auth.device_login set second_factor_at = now() where device_session_id = $1 and user_id = $2',
      [deviceSessionId, userId],
    );
  }

  /** Signs one person (or everyone) out of a device. Returns true when nobody is left. */
  async function signOut(deviceSessionId, userId = null) {
    await pool.query(
      'delete from wise_auth.device_login where device_session_id = $1 and ($2::uuid is null or user_id = $2)',
      [deviceSessionId, userId],
    );
    const left = await pool.query(
      'select 1 from wise_auth.device_login where device_session_id = $1 and expires_at > now() limit 1',
      [deviceSessionId],
    );
    if (left.rowCount) return false;
    await pool.query('delete from wise_auth.device_session where id = $1', [deviceSessionId]);
    return true;
  }

  /** Housekeeping, run at start-up: expired sign-ins, then device sessions nobody is signed in to. */
  async function sweep() {
    await pool.query('delete from wise_auth.device_login where expires_at <= now()');
    await pool.query(
      `delete from wise_auth.device_session s
        where s.last_seen_at < now() - interval '1 day'
          and not exists(select 1 from wise_auth.device_login l where l.device_session_id = s.id)`,
    );
    await pool.query('delete from wise_auth.email_token where expires_at <= now()');
  }

  return { find, issue, signIn, logins, touch, markSecondFactor, signOut, sweep, clearingCookie };
}
