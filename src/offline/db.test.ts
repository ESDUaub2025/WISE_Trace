import { afterEach,describe,expect,it } from 'vitest';
import { db,enqueue,syncOutbox } from './db';
import { ids } from '../lib/demo';
import type { Envelope } from '../lib/domain';
const envelope=():Envelope=>({id:crypto.randomUUID(),author_id:ids.producer,cooperative_id:ids.coop,device_id:ids.device,config_version_id:ids.config,observed_at:new Date().toISOString(),action:'checkpoint',payload:{value:22}});
afterEach(async()=>{await db.outbox.clear();await db.cache.clear();await db.media.clear();});
describe('durable outbox',()=>{
 it('rolls back the outbox and record when media cannot commit',async()=>{const e=envelope();const media={id:'duplicate',record_id:e.id,cooperative_id:e.cooperative_id,blob:new Blob(['photo']),type:'image/jpeg',uploaded:false};await db.media.add(media);await expect(enqueue(e,[media])).rejects.toThrow();expect(await db.outbox.get(e.id)).toBeUndefined();expect(await db.cache.get(`record:${e.id}`)).toBeUndefined();});
 it('sends dependency records in save order rather than random UUID order',async()=>{const first={...envelope(),id:'ffffffff-ffff-4fff-8fff-ffffffffffff',action:'batch'};const second={...envelope(),id:'00000000-0000-4000-8000-000000000000',action:'allocation'};await enqueue(first);await enqueue(second);const order:string[]=[];await syncOutbox(async e=>{order.push(e.action);return{status:'synced'};},ids.producer);expect(order).toEqual(['batch','allocation']);});
 it('commits source evidence and outbox atomically',async()=>{const e=envelope();await enqueue(e);expect((await db.cache.get(`record:${e.id}`))?.value).toEqual(e);expect((await db.outbox.get(e.id))?.status).toBe('saved');});
 it('retains failed sends for retry after reconnect',async()=>{const e=envelope();await enqueue(e);await syncOutbox(async()=>{throw new Error('network');},ids.producer);expect((await db.outbox.get(e.id))?.status).toBe('saved');await syncOutbox(async()=>({status:'synced'}),ids.producer);expect((await db.outbox.get(e.id))?.status).toBe('synced');});
 it('preserves conflicting payload and server reason',async()=>{const e=envelope();await enqueue(e);await syncOutbox(async()=>({status:'conflict',error:'Allocation exceeds available quantity'}),ids.producer);const entry=await db.outbox.get(e.id);expect(entry?.envelope).toEqual(e);expect(entry?.error).toContain('exceeds');expect(entry?.status).toBe('conflict');});
 it('isolates users pending records on a shared device',async()=>{const e={...envelope(),author_id:ids.supervisor};await enqueue(e);let called=false;await syncOutbox(async()=>{called=true;return{status:'synced'};},ids.producer);expect(called).toBe(false);expect((await db.outbox.get(e.id))?.status).toBe('saved');});
 it('recovers syncing entries left by a killed process',async()=>{const e=envelope();await enqueue(e);await db.outbox.update(e.id,{status:'syncing'});await syncOutbox(async()=>({status:'synced'}),ids.producer);expect((await db.outbox.get(e.id))?.status).toBe('synced');});
});
