import {sendPush} from './vapid.ts';
import type {SupabaseClient} from 'npm:@supabase/supabase-js@2.117.2';

export async function deliverPush(client:SupabaseClient) {
 const publicKey=Deno.env.get('VAPID_PUBLIC_KEY'),privateKey=Deno.env.get('VAPID_PRIVATE_KEY'),subject=Deno.env.get('VAPID_SUBJECT');
 if(!publicKey||!privateKey||!subject)return {enabled:false,delivered:0,failed:0};
 const {data,error}=await client.rpc('claim_push_deliveries');if(error)throw error;
 let delivered=0,failed=0;
 await Promise.all(data.map(async(job:{subscription:{endpoint:string};notification_id:string;subscription_id:string})=>{
  try{
   // Shared devices receive a generic prompt, never personal or food-safety data.
   await sendPush(job.subscription.endpoint,{subject,publicKey,privateKey});
   const result=await client.from('push_delivery').update({status:'delivered',delivered_at:new Date().toISOString(),last_error:null}).eq('notification_id',job.notification_id).eq('subscription_id',job.subscription_id);if(result.error)throw result.error;delivered++;
  }catch(e){
   const status=typeof e==='object'&&e!==null&&'statusCode' in e?Number(e.statusCode):0;
   // Do not persist provider response bodies, endpoints or encryption secrets.
   await client.from('push_delivery').update({status:[404,410].includes(status)?'expired':'failed',last_error:`Push provider status ${status||'unavailable'}`,next_attempt_at:new Date(Date.now()+15*60000).toISOString()}).eq('notification_id',job.notification_id).eq('subscription_id',job.subscription_id);
   if([404,410].includes(status))await client.from('push_subscription').update({enabled:false}).eq('id',job.subscription_id);failed++;
  }
 }));
 return {enabled:true,delivered,failed};
}
