// Adjustable values for signing in and staying signed in on a device.
// The server has its own, stricter list in server/auth/policy.mjs; the rules are explained in docs/AUTH.md.

export const sessionConfig = {
  /** Used until the approved procedure has been downloaded; the procedure can override both (PRD FR-AUTH-05). */
  defaults: {
    /** Minutes without a touch or key before the app asks for the PIN again. */
    lockAfterMinutes: 30,
    /** Days a person can keep unlocking with the PIN without the server confirming it. */
    offlineDays: 7,
  },
  /** Limits applied to whatever the procedure asks for, so a typo cannot disable the lock. */
  bounds: {
    lockAfterMinutes: { min: 1, max: 1440 },
    offlineDays: { min: 1, max: 30 },
  },
  /** Wrong PINs while offline before unlocking pauses. Online, the server counts instead (same numbers). */
  offlinePin: { maxFailures: 5, pauseMinutes: 15 },
  /** How often activity is written down, and how often the lock is checked. */
  activity: { recordEveryMs: 5_000, checkEveryMs: 10_000 },
  pin: { minLength: 4, maxLength: 6 },
  /** Must match server/auth/policy.mjs → password.minLength. */
  passwordMinLength: 12,
} as const;
