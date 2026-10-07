import {execFileSync,execSync,spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {stdout} from 'node:process';
import {randomUUID} from 'node:crypto';
import {setTimeout,clearTimeout} from 'node:timers';
const status=JSON.parse(execSync('npx supabase status -o json',{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
assert.equal(status.API_URL,'http://127.0.0.1:54321','This destructive fixture check is local-only');
const c=createClient(status.API_URL,status.ANON_KEY??status.PUBLISHABLE_KEY,{auth:{persistSession:false}});
assert.equal((await c.auth.signInWithPassword({email:'rima@users.wise.invalid',password:'wise-demo-only'})).error,null);
const sql=query=>execFileSync('docker',['exec','supabase_db_WISE_Trace','psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At','-c',query],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
async function rpc(name,args={}){const reply=await c.rpc(name,args);assert.equal(reply.error,null);return reply.data;}
async function changes(from,to){let position='0',all=[];for(;;){const page=await rpc('snapshot_changes',{from_snapshot:from,to_snapshot:to,after_revision:position,page_size:1});all.push(...page.changes);if(page.complete)return all;position=page.after_revision;}}
const long=randomUUID(),fast=randomUUID(),coop='10000000-0000-4000-8000-000000000001';
const insert=id=>`insert into public.supplier(id,cooperative_id,name,type,status) values('${id}','${coop}','Concurrent snapshot fixture','dairy','approved');`;
let child;
try{
 const anchor=await rpc('snapshot_checkpoint');
 child=spawn('docker',['exec','-i','supabase_db_WISE_Trace','psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{stdio:['pipe','pipe','pipe']});
 const finished=once(child,'close');finished.catch(()=>{});
 const ready=new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Transaction fixture did not start')),10000);child.on('error',reject);child.stdout.on('data',data=>{if(data.toString().includes('READY')){clearTimeout(timeout);resolve();}});});
 child.stdin.write(`begin;\n${insert(long)}\nselect 'READY';\n`);await ready;
 sql(insert(fast));
 const first=await rpc('snapshot_checkpoint');const page1=await changes(anchor.snapshot,first.snapshot);
 assert.ok(page1.some(change=>change.key===fast));assert.ok(!page1.some(change=>change.key===long));
 child.stdin.end('commit;\n');
 const [code]=await finished;assert.equal(code,0);
 const second=await rpc('snapshot_checkpoint');const page2=await changes(first.snapshot,second.snapshot);
 assert.ok(page2.some(change=>change.key===long),'Late commit must survive its lower revision number');
 assert.ok(!page2.some(change=>change.key===fast),'Already visible transaction is not repeatedly transferred');
 sql(`delete from public.supplier where id='${long}';`);
 const third=await rpc('snapshot_checkpoint');const deleted=await changes(second.snapshot,third.snapshot);
 assert.ok(deleted.some(change=>change.key===long&&change.row===null));
 stdout.write('Concurrent commit, page-size-one resume, duplicate exclusion and deletion checks passed.\n');
}finally{
 if(child?.exitCode===null)child.kill();
 sql(`delete from public.supplier where id in('${long}','${fast}');`);
}
