// Every adjustable authentication value lives in this file.
// Change a number here, run `npm run test:server`, and note the reason in docs/AUTH.md.
// Sources are cited so a reviewer can check each default against its reference.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const authPolicy = Object.freeze({
  password: {
    // NIST SP 800-63B §5.1.1.2: at least 8 characters, allow at least 64, no composition rules.
    // 12 keeps the length this project already required.
    minLength: 12,
    maxLength: 128,
    // OWASP Password Storage Cheat Sheet, scrypt: N=2^16, r=8, p=2 (about 64 MiB per hash).
    // Chosen over N=2^17 because the pilot server has little memory.
    scrypt: { logN: 16, r: 8, p: 2, keyLength: 64, saltLength: 16 },
  },

  // Wrong passwords or wrong authenticator codes before the account pauses.
  // Mirrors the PIN rule in the database (5 tries, 15 minutes). OWASP Authentication Cheat Sheet, "Account lockout".
  lockout: { maxFailures: 5, pauseMs: 15 * MINUTE },

  login: {
    // How long a person stays signed in on a device while they keep using it.
    idleMs: 30 * DAY,
    // The expiry is pushed forward at most this often, to avoid a write on every request.
    renewEveryMs: HOUR,
    // Administrators and Food-Safety Leads sign in again after this long, used or not.
    // NIST SP 800-63B §4.2.3 (AAL2): reauthenticate at least every 12 hours.
    privilegedMs: 12 * HOUR,
    // People remembered on one shared phone (PRD FR-AUTH-03). The oldest sign-in is dropped beyond this.
    maxPeoplePerDevice: 8,
  },

  // Roles that must prove a second factor (PRD FR-AUTH-01).
  secondFactorRoles: ['admin', 'food_safety'],

  // RFC 6238 defaults, as used by common authenticator apps.
  totp: { digits: 6, periodSeconds: 30, secretBytes: 20, allowedDriftSteps: 1, issuer: 'WISE' },

  emailToken: { verifyMs: 2 * DAY, resetMs: HOUR },

  cookie: {
    // The "__Host-" prefix makes browsers refuse the cookie unless it is Secure, host-only and Path=/.
    secureName: '__Host-wise_device',
    plainName: 'wise_device',
    // Browsers cap cookie lifetime at about 400 days; the server-side expiry above is what counts.
    maxAgeSeconds: 400 * 24 * 60 * 60,
  },

  // Requests per minute per address on the sign-in routes (the whole API allows 600).
  signInRateLimit: { max: 20, timeWindow: '1 minute' },
});

export const usernamePattern = /^[a-z0-9._-]{3,40}$/;
export const pinPattern = /^\d{4,6}$/;
/** Staff accounts have no email; the account table still needs a unique address. */
export const syntheticEmail = (username) => `${username}@users.wise.invalid`;
