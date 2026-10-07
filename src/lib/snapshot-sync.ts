import {db} from '../offline/db';
import {supabase} from './supabase';
import {createClient} from '@supabase/supabase-js';
import type {Identity} from './domain';
import type {Row} from './data';

export const snapshotTables=['lot','supplier','task','operational_record','deviation','equipment','training_module','training_completion','packaging_detail','sale','recall','notification','audit_event','membership','device','config_version','consumption','stage_event','attachment','cooperative','training_asset','material_disposition'] as const;
export interface SnapshotChange {table:string;key:string;row:Row|null;balance_lots:string[];}
interface Replica {
 version:1;fingerprint:string;rows:Row[][];snapshot:string;
 bootstrap?:{table:number;after:string|null};
 cycle?:{target:string;after:string};
 pendingBalanceIds:string[]|null;
 generation:string;
}
const keyColumn=(table:string)=>table==='membership'?'user_id':table==='packaging_detail'?'lot_id':'id';

async function blockCachedAccess(identity:Identity,reason:string) {
 await db.transaction('rw',db.cache,async()=>{
  await db.cache.put({key:`access-blocked:${identity.id}`,value:reason});
  await db.cache.bulkDelete([`snapshot:${identity.id}`,`replica:${identity.id}`,...(await db.cache.where('key').startsWith(`training:${identity.id}:`).primaryKeys())]);
  const active=(await db.cache.get('identity'))?.value as Identity|undefined;
  if(active?.id===identity.id)await db.cache.delete('identity');
 });
 // Retain the original outbox, media and signed evidence for server review.
}

export function mergeSnapshotChanges(rows:Row[][],changes:SnapshotChange[]) {
 const maps=new Map<number,Map<string,Row>>();
 for(const change of changes){
  const index=snapshotTables.findIndex(table=>table===change.table);if(index<0)continue;
  let map=maps.get(index);if(!map){map=new Map(rows[index].map(row=>[String(row[keyColumn(change.table)]),row]));maps.set(index,map);}
  if(change.row)map.set(change.key,change.row);else map.delete(change.key);
 }
 for(const [index,map] of maps)rows[index]=[...map.values()];
}

// Cache writes contain BOTH the merged rows and cursor. A killed/reloaded browser
// resumes the exact immutable transaction window; replay is safe by primary key.
export async function scopedReadClient(identity:Identity) {
 if(!supabase)throw new Error('setup');const session=await supabase.auth.getSession();
 if(!session.data.session||session.data.session.user.id!==identity.id)throw new Error('sessionExpired');
 return createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,{global:{headers:{Authorization:`Bearer ${session.data.session.access_token}`}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}

export async function checkSnapshotAccess(identity:Identity,client:Awaited<ReturnType<typeof scopedReadClient>>) {
 if(!supabase)throw new Error('setup');
 const checkpoint=await client.rpc('snapshot_checkpoint');if(checkpoint.error){if(['accountDisabled','sessionExpired'].includes(checkpoint.error.message))await blockCachedAccess(identity,checkpoint.error.message);throw new Error(checkpoint.error.message);}
 const current=checkpoint.data as {snapshot:string;epoch:string;access:string;cache_window?:string;identity:{cooperative_id:string;roles:string[];authorizations:Record<string,boolean>}};
 const authorizations=(value:Record<string,boolean>)=>JSON.stringify(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)));
 if(current.identity.cooperative_id!==identity.cooperative_id||JSON.stringify([...current.identity.roles].sort())!==JSON.stringify([...identity.roles].sort())||authorizations(current.identity.authorizations)!==authorizations(identity.authorizations)){await blockCachedAccess(identity,'sessionChanged');throw new Error('sessionChanged');}
 return current;
}

export async function incrementalSnapshot(identity:Identity,client:Awaited<ReturnType<typeof scopedReadClient>>):Promise<{rows:Row[][];balanceIds:string[]|null;generation:string}> {
 const current=await checkSnapshotAccess(identity,client);
 const key=`replica:${identity.id}`,fingerprint=`${import.meta.env.VITE_SUPABASE_URL}:${current.epoch}:${current.access}:bounded-v2:${current.cache_window??new Date().toISOString().slice(0,7)}`;
 let state=(await db.cache.get(key))?.value as Replica|undefined;
 let full=false;
 if(!state||state.version!==1||state.fingerprint!==fingerprint){
  state={version:1,fingerprint,rows:snapshotTables.map(()=>[]),snapshot:current.snapshot,bootstrap:{table:0,after:null},pendingBalanceIds:null,generation:crypto.randomUUID()};
  await putReplica(identity.id,key,state);full=true;
 }
 if(state.bootstrap){
  full=true;
  while(state.bootstrap.table<snapshotTables.length){
   const table=snapshotTables[state.bootstrap.table],column=keyColumn(table);
   const reply=await client.rpc('snapshot_bootstrap',{table_name:table,after_key:state.bootstrap.after,page_size:1000});if(reply.error)throw new Error(reply.error.message);
   const rows=reply.data as Row[];state.rows[state.bootstrap.table].push(...rows);
   if(rows.length===1000)state.bootstrap.after=String(rows.at(-1)![column]);
   else {state.bootstrap.table++;state.bootstrap.after=null;}
   await putReplica(identity.id,key,state);
  }
  delete state.bootstrap;
  await putReplica(identity.id,key,state);
 }
 const balanceIds=new Set<string>(state.pendingBalanceIds??[]);
 if(!state.cycle){state.cycle={target:current.snapshot,after:'0'};await putReplica(identity.id,key,state);}
 for(;;){
  const reply=await client.rpc('snapshot_changes',{from_snapshot:state.snapshot,to_snapshot:state.cycle.target,after_revision:state.cycle.after,page_size:500});
  if(reply.error)throw new Error(reply.error.message);
  const page=reply.data as {changes:SnapshotChange[];after_revision:string;complete:boolean};
  mergeSnapshotChanges(state.rows,page.changes);
  for(const change of page.changes)for(const lot of change.balance_lots??[])balanceIds.add(lot);
  state.pendingBalanceIds=state.pendingBalanceIds===null?null:[...balanceIds];state.generation=crypto.randomUUID();
  if(page.complete){state.snapshot=state.cycle.target;delete state.cycle;await putReplica(identity.id,key,state);break;}
  state.cycle.after=page.after_revision;await putReplica(identity.id,key,state);
 }
 return {rows:state.rows,balanceIds:full||state.pendingBalanceIds===null?null:[...balanceIds],generation:state.generation};
}

export async function commitSnapshot(identity:Identity,value:unknown,generation?:string) {
 return db.transaction('rw',db.cache,async()=>{
  await assertLease(identity.id);
  if(generation){const key=`replica:${identity.id}`,replica=(await db.cache.get(key))?.value as Replica|undefined;
   // Another tab without Web Locks may have progressed. Preserve its dirty set
   // and newer cached snapshot rather than allowing an older result to replace it.
   if(!replica||replica.generation!==generation)return;
   replica.pendingBalanceIds=[];await db.cache.put({key,value:replica});
  }
  await db.cache.put({key:`snapshot:${identity.id}`,value});
 });
}
const pending=new Map<string,Promise<unknown>>();
const owners=new Map<string,string>();
const leaseKey=(user:string)=>`snapshot-lease:${user}`;
async function assertLease(user:string){
 const owner=owners.get(user);if(!owner)return;
 const lease=(await db.cache.get(leaseKey(user)))?.value as {owner:string;expires:number}|undefined;
 if(lease?.owner!==owner)throw new Error('Snapshot refreshed in another tab; retry');
 await db.cache.put({key:leaseKey(user),value:{owner,expires:Date.now()+30000}});
}
async function putReplica(user:string,key:string,state:Replica){
 await db.transaction('rw',db.cache,async()=>{await assertLease(user);await db.cache.put({key,value:state});});
}
async function leased<T>(user:string,work:()=>Promise<T>):Promise<T>{
 const owner=crypto.randomUUID();
 for(;;){const acquired=await db.transaction('rw',db.cache,async()=>{
  const key=leaseKey(user),lease=(await db.cache.get(key))?.value as {owner:string;expires:number}|undefined;
  if(lease&&lease.expires>Date.now())return false;
  await db.cache.put({key,value:{owner,expires:Date.now()+30000}});return true;
 });if(acquired)break;await new Promise(resolve=>setTimeout(resolve,100));}
 owners.set(user,owner);
 try{return await work();}finally{
  owners.delete(user);
  await db.transaction('rw',db.cache,async()=>{const lease=(await db.cache.get(leaseKey(user)))?.value as {owner:string}|undefined;if(lease?.owner===owner)await db.cache.delete(leaseKey(user));});
 }
}
export async function withSnapshotLock<T>(user:string,work:()=>Promise<T>):Promise<T> {
 if(typeof navigator!=='undefined'&&navigator.locks)return navigator.locks.request(`wise-snapshot:${user}`,work);
 const previous=pending.get(user)??Promise.resolve();const current=previous.catch(()=>{}).then(()=>leased(user,work));pending.set(user,current);
 try{return await current;}finally{if(pending.get(user)===current)pending.delete(user);}
}
