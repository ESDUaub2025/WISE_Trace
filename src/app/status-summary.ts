// Decides the one thing the status indicator says. Kept free of React so the rule is easy to test and adjust.
import { syncConfig } from '../config/connectivity';
import type { Connectivity } from '../connectivity/connectivity';

export interface StatusSummary {
  /** ok: nothing to do. busy: records are on their way. warn: the person should know something. */
  tone: 'ok' | 'busy' | 'warn';
  /** Translation key (src/i18n). */
  key: string;
  /** Records have waited longer than syncConfig.staleAfterHours (PRD §10.2). */
  stale: boolean;
}

export function summarize(
  link: Connectivity,
  sync: { phase: string; waiting: number; conflicts: number; lastSentAt: string | null },
  now = Date.now(),
): StatusSummary {
  const stale =
    sync.waiting > 0 && !!sync.lastSentAt && now - Date.parse(sync.lastSentAt) > syncConfig.staleAfterHours * 3_600_000;
  // Priority: the connection first, then sending, then anything needing review.
  if (link === 'offline') return { tone: 'warn', key: sync.waiting ? 'statusOfflineWaiting' : 'statusOffline', stale };
  if (link === 'unreachable')
    return { tone: 'warn', key: sync.waiting ? 'statusUnreachableWaiting' : 'statusUnreachable', stale };
  if (sync.phase === 'sending' && sync.waiting) return { tone: 'busy', key: 'statusSending', stale };
  if (sync.phase === 'failed' && sync.waiting) return { tone: 'warn', key: 'statusSendFailed', stale };
  if (sync.waiting) return { tone: 'busy', key: 'statusWaiting', stale };
  if (sync.conflicts) return { tone: 'warn', key: 'statusConflicts', stale };
  return { tone: 'ok', key: 'statusAllSent', stale };
}
