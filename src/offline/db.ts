import Dexie, { type Table } from 'dexie';
import type { Envelope, SyncStatus } from '../lib/domain';
export interface OutboxEntry { id: string; envelope: Envelope; status: SyncStatus; error?: string; code?: string; attempts: number; sequence?: number; }
export interface CachedRecord { key: string; value: unknown; }
export interface MediaEntry { id: string; record_id: string; cooperative_id: string; blob: Blob; type: string; uploaded: boolean; }
export class WiseDB extends Dexie {
 outbox!: Table<OutboxEntry, string>; cache!: Table<CachedRecord, string>; media!: Table<MediaEntry, string>;
 constructor(name = 'wise-v1') { super(name); this.version(1).stores({ outbox: 'id,status,envelope.author_id,envelope.cooperative_id', cache: 'key', media: 'id,record_id,uploaded' }); }
}
export const db = new WiseDB();
export async function enqueue(envelope: Envelope,media:MediaEntry[]=[]) {
 await db.transaction('rw', db.cache, db.outbox, db.media, async () => {
  await db.cache.put({ key: `record:${envelope.id}`, value: envelope });
  const sequence=Number((await db.cache.get('outbox-sequence'))?.value??0)+1;
  await db.cache.put({key:'outbox-sequence',value:sequence});
  await db.outbox.add({ id: envelope.id, envelope, status: 'saved', attempts: 0, sequence });
  if(media.length)await db.media.bulkAdd(media);
 });
}
let syncing = false;
export async function syncOutbox(send: (envelope: Envelope) => Promise<{status: 'synced'|'conflict'; error?: string; code?: string}>, authorId: string) {
 if (syncing) return; syncing = true;
 try {
 const entries = await db.outbox.filter(e => e.envelope.author_id === authorId && ['saved','syncing'].includes(e.status)).toArray();
 entries.sort((a,b)=>(a.sequence??0)-(b.sequence??0)||a.envelope.observed_at.localeCompare(b.envelope.observed_at));
 for (const entry of entries) {
 await db.outbox.update(entry.id, { status: 'syncing', attempts: entry.attempts+1 });
 try { const receipt = await send(entry.envelope); await db.outbox.update(entry.id, { status: receipt.status, error: receipt.error, code: receipt.code }); }
 catch (e) { await db.outbox.update(entry.id, { status: 'saved', error: e instanceof Error ? e.message : 'sync_failed' }); break; }
 }
 } finally { syncing = false; }
}
export async function revokeLocalDevice() { await db.transaction('rw', db.cache, db.outbox, db.media, async () => { await db.cache.clear(); await db.outbox.clear(); await db.media.clear(); }); localStorage.clear(); }
