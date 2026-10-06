import { json } from '../_shared/http.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
Deno.serve(async request=>{const secret=Deno.env.get('SCHEDULER_SECRET');if(!secret||request.headers.get('Authorization')!==`Bearer ${secret}`)return json({error:'Forbidden'},403);const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);const {data,error}=await client.rpc('generate_tasks');return error?json({error:error.message},500):json({open_tasks:data});});
