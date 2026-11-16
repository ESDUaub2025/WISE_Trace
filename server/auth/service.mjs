// The authentication service: every sign-in rule in one place.
//
//   password  -> proves who you are to the server (once per device, until the sign-in expires)
//   PIN       -> unlocks your profile on a shared phone and signs critical actions (checked in the database)
//   authenticator code -> extra proof for administrators and Food-Safety Leads
//
// HTTP wiring is in server/http/session-routes.mjs; adjustable values are in ./policy.mjs.
import { createHash, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import nodemailer from 'nodemailer';
import { authPolicy } from './policy.mjs';
import { AuthError, authFailed, signInRequired } from './errors.mjs';
import {
  assertPasswordAllowed,
  hashPassword,
  needsRehash,
  spendVerificationTime,
  verifyPassword,
} from './passwords.mjs';
import { createSecretBox, enrolmentUri, matchingStep, newSecret } from './totp.mjs';
import { createAccounts } from './accounts.mjs';
import { createSessions } from './sessions.mjs';

const hashToken = (token) => createHash('sha256').update(token).digest('base64url');
const isBlocked = (account) => account.blocked_until && new Date(account.blocked_until) > new Date();

export function createAuthentication({
  connectionString,
  origin,
  secret,
  smtpUrl,
  mailFrom,
  allowLocalSignUp = false,
}) {
  if (!secret || secret.length < 32) throw new Error('AUTH_SECRET must contain at least 32 characters');
  const pool = new Pool({ connectionString, max: 3 });
  const accounts = createAccounts(pool);
  const sessions = createSessions(pool, { secureCookies: origin.startsWith('https:') });
  const secretBox = createSecretBox(secret);
  const mailer = smtpUrl ? nodemailer.createTransport(smtpUrl) : null;

  const needsSecondFactor = (account, roles) =>
    Boolean(account?.totp_confirmed_at) || roles.some((role) => authPolicy.secondFactorRoles.includes(role));

  /** What the app is told about one sign-in. Never includes secrets or the cookie value. */
  function describe(login, account, standing) {
    const required = needsSecondFactor(account, standing.roles);
    const proven = Boolean(login.second_factor_at);
    return {
      user: { id: login.user_id, email: login.email ?? account.email },
      // ready: may use the API. second_factor: enter a code. second_factor_setup: add an authenticator first.
      status: !required || proven ? 'ready' : account.totp_confirmed_at ? 'second_factor' : 'second_factor_setup',
      assurance: proven ? 'aal2' : 'aal1',
      disabled: !standing.allowed,
      expires_at: login.expires_at,
    };
  }

  async function describeLogin(login) {
    const [account, standing] = await Promise.all([accounts.findById(login.user_id), accounts.standing(login.user_id)]);
    return account ? describe(login, account, standing) : null;
  }

  /** Everyone signed in on the browser that sent this cookie. */
  async function people(cookieHeader) {
    const device = await sessions.find(cookieHeader);
    if (!device) return [];
    const described = await Promise.all((await sessions.logins(device.id)).map(describeLogin));
    return described.filter(Boolean);
  }

  /**
   * The person a request acts as, or null when nobody is signed in.
   * With several people on one phone the app must name the acting person (X-Wise-User).
   */
  async function identify(cookieHeader, actingUser) {
    const device = await sessions.find(cookieHeader);
    if (!device) {
      if (actingUser) throw new AuthError('sessionExpired', 401);
      return null;
    }
    const logins = await sessions.logins(device.id);
    const login = actingUser
      ? logins.find((row) => row.user_id === actingUser)
      : logins.length === 1
        ? logins[0]
        : null;
    if (!login) {
      if (actingUser) throw new AuthError('sessionExpired', 401);
      if (logins.length > 1) throw new AuthError('sessionChanged', 401);
      return null;
    }
    const [account, standing] = await Promise.all([accounts.findById(login.user_id), accounts.standing(login.user_id)]);
    if (!account) throw new AuthError('sessionExpired', 401);
    const summary = describe(login, account, standing);
    const privileged = standing.roles.some((role) => authPolicy.secondFactorRoles.includes(role));
    await sessions.touch(device.id, login, { privileged });
    return {
      id: login.user_id,
      aal: summary.assurance,
      status: summary.status,
      disabled: summary.disabled,
      roles: standing.roles,
      user: summary.user,
      deviceSessionId: device.id,
    };
  }

  /** Checks a password with the same timing and the same answer whether or not the account exists. */
  async function checkPassword(account, password) {
    if (!account) {
      await spendVerificationTime(password);
      throw authFailed();
    }
    if (isBlocked(account)) throw new AuthError('tooManyAttempts', 429, { retry_at: account.blocked_until });
    if (!(await verifyPassword(String(password ?? ''), account.password_hash))) {
      await accounts.recordFailure(account.id);
      throw authFailed();
    }
    await accounts.clearFailures(account.id);
    if (needsRehash(account.password_hash)) await accounts.storePasswordHash(account.id, await hashPassword(password));
  }

  async function signIn({ identifier, password, cookieHeader, userAgent }) {
    const account = await accounts.findByIdentifier(identifier);
    await checkPassword(account, password);
    if (!account.email_confirmed_at) {
      await sendVerification(account).catch(() => {});
      throw new AuthError('emailUnverified', 403);
    }
    const standing = await accounts.standing(account.id);
    if (!standing.allowed) throw new AuthError('accountDisabled', 403);
    const existing = await sessions.find(cookieHeader);
    const device = await sessions.issue(existing?.id, userAgent);
    const privileged = standing.roles.some((role) => authPolicy.secondFactorRoles.includes(role));
    await sessions.signIn(device.id, account.id, { privileged });
    const login = (await sessions.logins(device.id)).find((row) => row.user_id === account.id);
    return { setCookie: device.setCookie, login: describe(login, account, standing) };
  }

  /** Starts authenticator set-up for someone who has proved their password but has no authenticator yet. */
  async function beginSecondFactor(identity) {
    const account = await accounts.findById(identity.id);
    if (!account) throw signInRequired();
    if (account.totp_confirmed_at) throw new AuthError('secondFactorAlreadySet', 409);
    const secretText = newSecret();
    await accounts.saveTotpSecret(account.id, secretBox.seal(secretText));
    return {
      secret: secretText,
      uri: enrolmentUri(secretText, identity.user.email.replace(/@users\.wise\.invalid$/, '')),
    };
  }

  /** Checks an authenticator code; the first accepted code also confirms a new authenticator. */
  async function proveSecondFactor(identity, code) {
    const account = await accounts.findById(identity.id);
    if (!account?.totp_secret) throw new AuthError('secondFactorSetupRequired', 409);
    if (isBlocked(account)) throw new AuthError('tooManyAttempts', 429, { retry_at: account.blocked_until });
    const step = matchingStep(secretBox.open(account.totp_secret), code, account.totp_last_step ?? -1);
    if (step === null || !(await accounts.acceptTotpStep(account.id, step))) {
      await accounts.recordFailure(account.id);
      throw new AuthError('codeFailed', 401);
    }
    await sessions.markSecondFactor(identity.deviceSessionId, identity.id);
    const login = (await sessions.logins(identity.deviceSessionId)).find((row) => row.user_id === identity.id);
    return describeLogin(login);
  }

  /** Signs out one person, or everyone when no user is given. Returns the cookie header to send when the device is empty. */
  async function signOut(cookieHeader, userId = null) {
    const device = await sessions.find(cookieHeader);
    if (!device) return sessions.clearingCookie();
    return (await sessions.signOut(device.id, userId)) ? sessions.clearingCookie() : null;
  }

  async function changePassword(identity, currentPassword, nextPassword) {
    const account = await accounts.findById(identity.id);
    await checkPassword(account, currentPassword);
    await accounts.setPassword(identity.id, nextPassword, { keepDeviceSession: identity.deviceSessionId });
  }

  // ----- Email: self-registration and forgotten passwords. Only active when SMTP is configured. -----

  async function issueEmailToken(userId, purpose, lifetimeMs) {
    const token = randomBytes(32).toString('base64url');
    await pool.query(
      `insert into wise_auth.email_token(token_hash, user_id, purpose, expires_at)
       values($1, $2, $3, now() + ($4 || ' milliseconds')::interval)`,
      [hashToken(token), userId, purpose, String(lifetimeMs)],
    );
    return token;
  }

  /** Marks a token used and returns its owner; null when unknown, expired or already used. */
  async function redeemEmailToken(token, purpose) {
    const result = await pool.query(
      `update wise_auth.email_token set used_at = now()
        where token_hash = $1 and purpose = $2 and used_at is null and expires_at > now()
        returning user_id`,
      [hashToken(String(token ?? '')), purpose],
    );
    return result.rows[0]?.user_id ?? null;
  }

  async function sendVerification(account) {
    if (!mailer) return;
    const token = await issueEmailToken(account.id, 'verify_email', authPolicy.emailToken.verifyMs);
    await mailer.sendMail({
      from: mailFrom,
      to: account.email,
      subject: 'Verify your WISE email',
      text: `Open this link to verify your email: ${origin}/api/session/verify-email?token=${token}`,
    });
  }

  /** Self-registration. The reply is the same whether or not the address is already known. */
  async function signUp({ email, password, displayName }) {
    if (!mailer && !allowLocalSignUp) throw new AuthError('registrationManaged', 503);
    const address = String(email ?? '')
      .trim()
      .toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(address) || address.length > 254 || address.endsWith('@users.wise.invalid')) {
      throw new AuthError('emailInvalid', 400);
    }
    try {
      const account = await accounts.create({
        email: address,
        password,
        displayName: String(displayName ?? '').slice(0, 100),
      });
      await sendVerification(account);
    } catch (error) {
      if (!(error instanceof AuthError) || error.message !== 'accountExists') throw error;
    }
  }

  async function verifyEmail(token) {
    const userId = await redeemEmailToken(token, 'verify_email');
    if (userId) await accounts.confirmEmail(userId);
    return Boolean(userId);
  }

  /** Always succeeds from the caller's view, so it cannot be used to learn which addresses have accounts. */
  async function requestPasswordReset(email) {
    if (!mailer) return;
    const account = await accounts.findByIdentifier(String(email ?? '').includes('@') ? email : '');
    if (!account || account.email.endsWith('@users.wise.invalid')) return;
    const token = await issueEmailToken(account.id, 'reset_password', authPolicy.emailToken.resetMs);
    await mailer.sendMail({
      from: mailFrom,
      to: account.email,
      subject: 'Reset your WISE password',
      text: `Open this link to choose a new password: ${origin}/?reset=${token}`,
    });
  }

  async function resetPassword(token, password) {
    assertPasswordAllowed(password); // before the single-use link is spent
    const userId = await redeemEmailToken(token, 'reset_password');
    if (!userId) throw new AuthError('linkExpired', 400);
    await accounts.setPassword(userId, password);
    await accounts.confirmEmail(userId);
  }

  return {
    pool,
    accounts,
    people,
    identify,
    signIn,
    beginSecondFactor,
    proveSecondFactor,
    signOut,
    changePassword,
    signUp,
    verifyEmail,
    requestPasswordReset,
    resetPassword,
    capabilities: () => ({
      registration: mailer || allowLocalSignUp ? 'email' : 'administrator',
      passwordReset: Boolean(mailer),
    }),
    sweep: () => sessions.sweep(),
    close: () => pool.end(),
  };
}
