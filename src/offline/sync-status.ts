// What the person is told about their records leaving the phone (PRD §10.2):
// how many are waiting, whether sending is in progress, when it last worked, and whether anything needs attention.
// Both workspaces show this through src/app/ConnectionStatus.tsx.
import { db } from './db';

export interface SyncStatus {
  phase: 'idle' | 'sending' | 'failed';
  /** Records saved on this device that the server has not confirmed yet. */
  waiting: number;
  /** Records the server could not accept as sent; a supervisor resolves them. */
  conflicts: number;
  /** ISO time of the last completed send, or null when this device has never sent. */
  lastSentAt: string | null;
  /** Why the last attempt failed (a translation key or the server's sentence). */
  error?: string;
}

type Listener = () => void;
let status: SyncStatus = { phase: 'idle', waiting: 0, conflicts: 0, lastSentAt: null };
const listeners = new Set<Listener>();

function update(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((listener) => listener());
}

export const syncStatus = {
  get: () => status,
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  sending: () => update({ phase: 'sending', error: undefined }),
  failed: (error: string) => update({ phase: 'failed', error }),
  sent: (at: string) => update({ phase: 'idle', lastSentAt: at, error: undefined }),
  /** Recounts from the outbox. Call after saving a record and after each send. */
  async recount(authorId: string) {
    const entries = await db.outbox.filter((entry) => entry.envelope.author_id === authorId).toArray();
    const lastSentAt = ((await db.cache.get(`last-sync:${authorId}`))?.value as string | undefined) ?? null;
    update({
      waiting: entries.filter((entry) => entry.status === 'saved' || entry.status === 'syncing').length,
      conflicts: entries.filter((entry) => entry.status === 'conflict').length,
      lastSentAt,
    });
  },
  reset: () => update({ phase: 'idle', waiting: 0, conflicts: 0, lastSentAt: null, error: undefined }),
};
