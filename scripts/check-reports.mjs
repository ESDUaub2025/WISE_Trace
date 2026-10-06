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
