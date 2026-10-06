import {execSync} from 'node:child_process';
import {stdout} from 'node:process';
import {Buffer} from 'node:buffer';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
const status=JSON.parse(execSync('npx supabase status -o json',{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const key=status.PUBLISHABLE_KEY??status.ANON_KEY;const client=createClient(status.API_URL,key,{auth:{persistSession:false}});
const auth=await client.auth.signInWithPassword({email:'karim@users.wise.invalid',password:'wise-demo-only'});assert.equal(auth.error,null);
for(const format of ['csv','xlsx','pdf']){
 const response=await globalThis.fetch(status.API_URL+'/functions/v1/report',{method:'POST',headers:{Authorization:'Bearer '+auth.data.session.access_token,apikey:key,'Content-Type':'application/json'},body:JSON.stringify({report:'lot',format})});
 if(!response.ok)throw new Error(format+': '+await response.text());
 const bytes=Buffer.from(await response.arrayBuffer());assert.ok(bytes.length>100);if(format==='pdf')assert.equal(bytes.subarray(0,4).toString(),'%PDF');if(format==='xlsx')assert.equal(bytes.subarray(0,2).toString(),'PK');if(format==='csv')assert.ok(bytes.toString().includes('KB-AKR01'));
 stdout.write('Live '+format.toUpperCase()+' report passed ('+bytes.length+' bytes).\n');
}
async function csv(body){const r=await globalThis.fetch(status.API_URL+'/functions/v1/report',{method:'POST',headers:{Authorization:'Bearer '+auth.data.session.access_token,apikey:key,'Content-Type':'application/json'},body:JSON.stringify({format:'csv',...body})});if(!r.ok)throw new Error(await r.text());return r.text();}
const whey=await csv({report:'lot',lot_type:'whey'});assert.ok(whey.includes('WL-AKR01'));assert.ok(!whey.includes('KB-AKR01'));
const empty=await csv({report:'lot',from_date:'2090-01-01',to_date:'2090-01-02'});assert.ok(!empty.includes('WL-AKR01'));
const records=await client.from('operational_record').select('lot_id').eq('kind','checkpoint');const packages=await client.from('packaging_detail').select('batch_id');const target=packages.data?.find(p=>records.data?.some(r=>r.lot_id===p.batch_id))?.batch_id;assert.ok(target,'A packaged production fixture is required; run live-api-check first');const history=await csv({report:'traceability',target});for(const kind of ['consumption','operational_record','packaging_detail','lot_state_event'])assert.ok(history.includes(kind),'Trace includes '+kind);
stdout.write('Report filters and complete trace history passed.\n');
