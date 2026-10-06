import {readFileSync} from 'node:fs';
import {env,argv,stdout} from 'node:process';
import {createClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {demoConfig} from '../src/lib/demo.ts';
const account=z.object({username:z.string().regex(/^[a-z0-9._-]{3,40}$/),display_name:z.string().min(2),password:z.string().min(12).refine(value=>!value.startsWith('REPLACE_')&&!value.startsWith('CHANGE_'),'Replace the example password'),pin:z.string().regex(/^\d{4,6}$/)});
const schema=z.object({cooperative:z.object({code:z.string().regex(/^[A-Z0-9]{3,12}$/),name:z.string().min(3),region:z.string().min(2),contacts:z.record(z.string(),z.unknown()).default({}),sites:z.array(z.unknown()).default([])}),admin:account,food_safety:account});
if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('Set server-only SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the terminal environment.');
const input=schema.parse(JSON.parse(readFileSync(argv[2]??'wise.bootstrap.json','utf8')));if(input.admin.username===input.food_safety.username)throw new Error('Separate accounts are required');
const client=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});const existing=await client.from('membership').select('user_id').limit(1);if(existing.error)throw existing.error;if(existing.data.length)throw new Error('Installation already has users; use normal administration.');
const created=[];try{
 for(const role of ['admin','food_safety']){const a=input[role];const response=await client.auth.admin.createUser({email:a.username+'@users.wise.invalid',password:a.password,email_confirm:true});if(response.error)throw response.error;created.push({...a,id:response.data.user.id,role});}
 const result=await client.rpc('bootstrap_installation',{coop:globalThis.crypto.randomUUID(),details:input.cooperative,accounts:created.map(({id,role,username,display_name,pin})=>({id,role,username,display_name,pin})),configuration:demoConfig.definition});if(result.error)throw result.error;
 stdout.write('Owner accounts and a PLACEHOLDER draft were created. Enroll MFA, review the draft, and have the separate Food-Safety Lead approve validated configuration before production.\n');
}catch(error){for(const account of created)await client.auth.admin.deleteUser(account.id);throw error;}
