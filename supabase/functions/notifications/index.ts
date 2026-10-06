import {authenticate,json} from '../_shared/http.ts';
interface Alert {notification_id:string;recipient_id:string;channel:string;destination:string;kind:string;}
interface NotificationProvider {send(alert:Alert):Promise<{provider:string;delivered:boolean}>;}
class LogProvider implements NotificationProvider {
 async send(alert:Alert) {
  console.info(JSON.stringify({provider:'log',notification_id:alert.notification_id,recipient_id:alert.recipient_id,channel:alert.channel,at:new Date().toISOString()}));
  return {provider:'log',delivered:false};
 }
}
const provider:NotificationProvider=new LogProvider();
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return json({});
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 try{
  const {user}=await authenticate(request);const body=await request.json();
  const {data,error}=await user.rpc('prepare_notification_delivery',{target:body.notification_id,recipient:body.recipient_id});
  if(error)throw error;
  // The development provider never contacts recipients or logs phone numbers.
  return json({...await provider.send(data),notification_id:data.notification_id,channel:data.channel});
 }catch(e){return json({error:e instanceof Error?e.message:'Alert delivery failed'},400);}
});
