import {json,serverClient} from '../_shared/http.ts';
import {deliverPush} from '../_shared/push.ts';
import {deliverAlerts} from '../_shared/alerts.ts';
import {deliverMonthlyReports} from '../_shared/monthly-reports.ts';
Deno.serve(async request=>{
 const secret=Deno.env.get('SCHEDULER_SECRET');if(!secret||request.headers.get('Authorization')!==`Bearer ${secret}`)return json({error:'Forbidden'},403);
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 try{const client=serverClient();const {data,error}=await client.rpc('generate_tasks');if(error)throw error;return json({open_tasks:data,push:await deliverPush(client),alerts:await deliverAlerts(client),reports:await deliverMonthlyReports(client)});}catch{return json({error:'Scheduled task processing failed'},500);}
});
