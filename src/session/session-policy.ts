// When a person must unlock again, and how long they may work without the server.
// The approved procedure can set both values per cooperative; defaults and limits are in src/config/session.ts.
import { sessionConfig } from '../config/session';
import type { Config } from '../lib/domain';

export interface SessionLimits {
  /** Days the PIN keeps working without the server confirming it (PRD FR-AUTH-05, default 7). */
  offlineDays: number;
  /** Minutes without activity before the app locks. */
  inactivityMinutes: number;
}

const clamp = (value: unknown, fallback: number, { min, max }: { min: number; max: number }) =>
  Math.max(min, Math.min(max, Number(value ?? fallback) || fallback));

export function sessionLimits(definition?: Config['definition']): SessionLimits {
  const { defaults, bounds } = sessionConfig;
  return {
    offlineDays: clamp(definition?.session_offline_days, defaults.offlineDays, bounds.offlineDays),
    inactivityMinutes: clamp(
      definition?.session_inactivity_minutes,
      defaults.lockAfterMinutes,
      bounds.lockAfterMinutes,
    ),
  };
}

export function offlineExpired(confirmedAt: number, now: number, limits: SessionLimits) {
  return now - confirmedAt > limits.offlineDays * 86_400_000;
}

export function inactive(lastActivity: number, now: number, limits: SessionLimits) {
  return now - lastActivity > limits.inactivityMinutes * 60_000;
}

// The limits and the last activity are small values read often, so they live in localStorage.
// They survive the app being closed: reopening within the lock window does not ask for the PIN again.
const limitsKey = (id: string) => `wise-session-limits:${id}`;
const activityKey = (id: string) => `wise-last-activity:${id}`;

/** Called when fresh data arrives, so the lock follows the cooperative's approved procedure. */
export function rememberLimits(id: string, definition?: Config['definition']) {
  try {
    localStorage.setItem(limitsKey(id), JSON.stringify(sessionLimits(definition)));
  } catch {
    /* defaults apply */
  }
}

export function limitsFor(id: string): SessionLimits {
  try {
    const stored = JSON.parse(localStorage.getItem(limitsKey(id)) ?? 'null') as Partial<SessionLimits> | null;
    if (stored)
      return sessionLimits({
        session_offline_days: stored.offlineDays,
        session_inactivity_minutes: stored.inactivityMinutes,
      } as Config['definition']);
  } catch {
    /* defaults apply */
  }
  return sessionLimits();
}

export function markActive(id: string, now = Date.now()) {
  try {
    localStorage.setItem(activityKey(id), String(now));
  } catch {
    /* the lock then falls back to the unlock time */
  }
}

export function lastActivity(id: string): number {
  try {
    return Number(localStorage.getItem(activityKey(id)) ?? 0);
  } catch {
    return 0;
  }
}
