# Sign-in, sessions and connection status

How people prove who they are, how a shared phone stays attributable, and how the app decides it is online.
Written 2026-11-11 with the sign-in rebuild. Every number mentioned here is set in one of two files:

| What | File |
| --- | --- |
| Server rules (password, lockout, sign-in lifetime, authenticator, cookie) | [server/auth/policy.mjs](../server/auth/policy.mjs) |
| Device rules (inactivity lock, offline allowance, PIN length) | [src/config/session.ts](../src/config/session.ts) |
| Connection checks and background sending | [src/config/connectivity.ts](../src/config/connectivity.ts) |
| Who starts in which workspace | [src/config/workspaces.ts](../src/config/workspaces.ts) |

## 1. The model in one table

| Secret | Proves | Asked for | Checked by |
| --- | --- | --- | --- |
| Password | Who you are, to the server | Once per device, until the sign-in expires | Server (scrypt hash) |
| PIN (4–6 digits) | That it is you holding the shared phone now | Every unlock, every person switch, every critical sign-off | Server when reachable; the device otherwise |
| Authenticator code | Extra proof for administrators and Food-Safety Leads | With the password | Server (RFC 6238) |

What a producer experiences: the first time on a phone, username + password, then PIN. After that, tap your name and enter your PIN, online or offline.

## 2. Requirements this implements

| PRD | Requirement | Where |
| --- | --- | --- |
| FR-AUTH-01 | Username or phone + password or PIN; second factor for admins and Food-Safety Leads | `server/auth/service.mjs` (`signIn`, `proveSecondFactor`), `policy.secondFactorRoles` |
| FR-AUTH-02 | Access enforced on the server | Every data call runs in PostgreSQL as the signed-in person (`server/database.mjs`), row-level security unchanged |
| FR-AUTH-03 | Several people signed in on one device, switching by PIN | `wise_auth.device_login` (one row per person per browser), `src/account/AccountScreens.tsx` |
| FR-AUTH-04 | PIN re-entry for critical actions | Unchanged: `pin_signoff` in the database |
| FR-AUTH-05 | Inactivity expiry; offline validity (default 7 days) | `src/session/session-policy.ts`, `src/session/SessionProvider.tsx` |
| FR-AUTH-06 | Disable immediately; pending offline records still accepted and flagged | `identify(..., { allowDisabled })` for sync only (`server/app.mjs`) |
| FR-AUTH-07 | Revoked device wipes local data on next connection | `src/session/session.ts` (`deviceRevoked` → `revokeLocalDevice`) |
| §12.1 | Rate limiting on sign-in | `policy.signInRateLimit`, `policy.lockout` |

## 3. Server design

Four tables in the `wise_auth` schema (migration `202611110094_account_sessions.sql`):

- `credential`: password hash, failed-attempt counter, sealed authenticator secret.
- `device_session`: one per browser. The cookie holds a random 256-bit value; the table stores only its SHA-256 hash.
- `device_login`: one per person signed in on that browser, with its own expiry and second-factor time.
- `email_token`: single-use links for email verification and password reset (hashed).

Roles, cooperative and PIN stay where they were (`public.membership`, `private.user_pin`).

A request is authorized like this (`authentication.identify`):

1. The cookie selects the device session.
2. The `X-Wise-User` header names the acting person, who must have an unexpired sign-in on that device. With exactly one person signed in, the header is optional.
3. If the person's roles require a second factor and this sign-in has not proved one, every data route answers `secondFactorRequired`.
4. The database transaction runs as that person, so row-level security applies.

### Choices and their sources

| Choice | Value | Source |
| --- | --- | --- |
| Password length | 12–128, no composition rules | NIST SP 800-63B §5.1.1.2 (minimum 8, allow at least 64, no composition rules) |
| Password hash | scrypt N=2^16, r=8, p=2 | OWASP Password Storage Cheat Sheet (scrypt configurations). The 64 MiB variant fits the 240 MB API container; hashes run one at a time |
| Unknown user vs wrong password | Same answer, same work | OWASP Authentication Cheat Sheet ("authentication responses") |
| Lockout | 5 failures → 15 minutes | Same cheat sheet ("account lockout"); matches the existing PIN rule |
| Cookie | `HttpOnly`, `SameSite=Lax`, `Secure` + `__Host-` prefix on HTTPS | OWASP Session Management Cheat Sheet |
| Cross-site requests | Exact `Origin` check on every write, no CORS | OWASP CSRF Prevention Cheat Sheet (verifying origin) |
| Session fixation | New cookie value at every password sign-in | OWASP Session Management Cheat Sheet ("renew the session ID after any privilege level change") |
| Authenticator | TOTP, SHA-1, 6 digits, 30 s, ±1 step, each code once | RFC 6238 §4, §5.2 |
| Privileged sign-in lifetime | 12 hours | NIST SP 800-63B §4.2.3 (AAL2 reauthentication) |
| Ordinary sign-in lifetime | 30 days since last use | Project choice: producers should rarely retype a password; the PIN and inactivity lock protect the shared phone |

The scrypt memory figure and the RFC 6238 test vectors are checked by `server/tests/auth-unit.test.mjs`. The standards themselves were cited from memory and should be re-read before a formal security review.

### What the second factor protects

An administrator's sign-in is useless until the code is entered: the API refuses data, not just the screens. The secret is sealed with AES-256-GCM under a key derived from `AUTH_SECRET`, so a database copy alone cannot generate codes. Changing `AUTH_SECRET` therefore invalidates every authenticator (recover with `reset-authenticator` below).

## 4. Device design

The browser keeps, per remembered person (`src/session/profiles.ts`): their profile, a PBKDF2 check value for the PIN, the time the server last confirmed the PIN, and for people allowed to decide on whey offline a sealed signing secret. It never stores the password or the PIN.

Unlocking (`unlockWithPin`):

- **Server reachable**: the server checks the PIN (and counts wrong tries), registers the device and returns the current profile. If the server no longer has a sign-in for this person, the app asks for the password once and reuses the PIN already typed.
- **Not reachable**: the device checks the PIN itself, allows 5 wrong tries per 15 minutes, and refuses once the offline allowance has passed.

Locking: after the configured minutes without a touch or key, the app returns to the unlock screen. Nothing is erased. The lock window survives closing the app.

### Limits you should know

- The PIN gate on a shared phone is about **attribution between colleagues**, not about resisting someone with developer tools: data cached in the browser is not encrypted, as the architecture notes already state. Critical actions are protected separately by the server-checked PIN sign-off.
- A 4-digit PIN check value stored on the device can be brute-forced by someone who copies the browser's storage. This is why the offline allowance is limited and why the server, not the device, issues the offline whey-decision credential.
- Password reset by email exists only when SMTP is configured. Otherwise a manager or administrator resets access (below).

## 5. Online, unreachable, offline

`navigator.onLine` only says the phone has a network interface. The app asks the server instead (`src/connectivity/connectivity.ts`):

| State | Meaning | Shown as |
| --- | --- | --- |
| online | `/api/health` answered recently | "Everything is sent" or the number waiting |
| unreachable | Network present, server silent | "WISE not reachable" |
| offline | No network | "Offline" |

Checks run every 30 s while healthy, sooner after a failure (5 s doubling to 60 s), immediately when the browser reports a network change or the app returns to the foreground, and whenever a real request fails. Recording works in all three states; sending and online-only actions wait for `online`.

The indicator (`src/app/ConnectionStatus.tsx`) is the same component in both workspaces and on the sign-in screens. The rule for what it says first is in `src/app/status-summary.ts`.

## 6. Operating it

### After deploying this version

The migration removes the previous sign-in tables. Accounts, roles and PINs remain, but **every account needs a new password**, and administrators set up their authenticator again at first sign-in.

```sh
# on the server, with the owner DATABASE_URL and the API's AUTH_SECRET
node server/cli/account.mjs list
node server/cli/account.mjs set-password wise_admin
node server/cli/account.mjs set-password wise_food_safety
```

Administrators then reset everyone else from Organization → "Reset password or PIN".

### Everyday recovery

| Situation | Who | How |
| --- | --- | --- |
| Member forgot password or PIN | Their manager, or a WISE Admin | Organization → Reset password or PIN |
| Administrator lost their authenticator | Operator | `node server/cli/account.mjs reset-authenticator <username>` |
| Phone lost | Manager or admin | Organization → Revoke device, then reset the member's password |
| Suspicious activity | Operator | `node server/cli/account.mjs sign-out <username>` |

### Local development

`npm run showcase:demo -- --reset` rebuilds the fixture database. Every fixture account uses password `wise-demo-only` and PIN `2468`.

## 7. Tests

| Covers | Command |
| --- | --- |
| Hashing, RFC 6238 vectors, sealing | `node --test server/tests/auth-unit.test.mjs` |
| Sign-in over HTTP: cookies, second factor, shared phone, lockout, reset, restricted database login | `npm run test:server` |
| Connection state machine, workspace choice, status wording, session limits | `npm test` |
| The real screens against the real API | `npm run test:live` |

## 8. "Cannot sign in" right after an update

Check first whether the browser is showing an old copy of the app. An installed app keeps its previous version in a service-worker cache; an old screen talking to a new server fails with an authentication error although the account is fine (seen 2026-11-11: the old three-field sign-in called an address the new server no longer has).

- **Tell-tale:** the sign-in asks for username, password and PIN on one screen. The current app never does.
- **Now automatic:** a new version takes over as soon as it is downloaded and the page reloads at a safe moment (`vite.config.ts`, `src/app/app-update.ts`). The development server also retires any old service worker on its address.
- **One-time step for a device still on a version from before this fix:** open the app while online and wait a few seconds, or reload once.
