import { useEffect, useState } from 'react';
import { db, discardConflict, type OutboxEntry } from '../offline/db';
import { syncStatus } from '../offline/sync-status';
import { useSyncStatus } from '../app/use-status';
import { useText } from '../simple/text';
import { useWorkerText } from './copy';
import type { Snapshot } from '../lib/data';

export function PendingChanges({ userId, refresh }: { userId: string; refresh: () => Promise<Snapshot | undefined> }) {
  const { conflicts } = useSyncStatus();
  const { error: errorText } = useText();
  const { w } = useWorkerText();
  const [items, setItems] = useState<OutboxEntry[]>([]);
  const [confirm, setConfirm] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void db.outbox
      .filter((e) => e.envelope.author_id === userId && e.status === 'conflict')
      .toArray()
      .then((value) => {
        if (active) setItems(value);
      });
    return () => {
      active = false;
    };
  }, [conflicts, userId]);
  async function discard(id: string) {
    await discardConflict(id, userId);
    await syncStatus.recount(userId);
    await refresh();
    setConfirm(null);
  }
  if (!items.length) return null;
  return (
    <section className="w-card">
      <h2>{w('unsentTitle')}</h2>
      <p>{w('unsentHelp')}</p>
      {items.map((item) => (
        <div className="w-card" key={item.id}>
          <p>{errorText(item.error ?? 'fileConflict')}</p>
          {confirm === item.id ? (
            <>
              <p>{w('discardHelp')}</p>
              <button className="w-secondary" onClick={() => void discard(item.id)}>
                {w('discard')}
              </button>
              <button className="w-text" onClick={() => setConfirm(null)}>
                {w('cancel')}
              </button>
            </>
          ) : (
            <button className="w-secondary" onClick={() => setConfirm(item.id)}>
              {w('discard')}
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
