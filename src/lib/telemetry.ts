import {db} from '../offline/db';
import {supabase,demo} from './supabase';
type Diagnostic={id:string;user:string;device:string;code:string;screen:string;observed:string};
let flushing=false;
export async function flushDiagnostics(){
 if(flushing||!supabase||!navigator.onLine||demo)return;flushing=true;
 try{const session=await supabase.auth.getSession();const user=session.data.session?.user.id;if(!user)return;
 for(const row of await db.cache.where('key').startsWith('diagnostic:').toArray()){const event=row.value as Diagnostic;if(event.user!==user)continue;const reply=await supabase.rpc('record_client_diagnostic',{target:event.id,device:event.device,code:event.code,screen:event.screen,observed:event.observed});if(reply.error)break;await db.cache.delete(row.key);}
 }catch{/* Retain queued diagnostics until the next connection. */}finally{flushing=false;}
}
export async function captureDiagnostic(code:Diagnostic['code']){
 try{if(demo||!supabase)return;const session=await supabase.auth.getSession();const user=session.data.session?.user.id;if(!user)return;
 const screen=location.pathname.split('/')[1]||'home';const allowed=['home','whey','batches','inventory','review','deviations','recall','training','equipment','dashboards','reports','organization','admin'];
 const event:Diagnostic={id:crypto.randomUUID(),user,device:localStorage.getItem('wise-device')??'',code,screen:allowed.includes(screen)?screen:'public',observed:new Date().toISOString()};
 if(await db.cache.where('key').startsWith('diagnostic:').count()>=100)return;await db.cache.put({key:`diagnostic:${event.id}`,value:event});await flushDiagnostics();
 }catch{/* Telemetry must never interrupt recording. */}
}
export function installDiagnostics(){window.addEventListener('error',()=>{void captureDiagnostic('client_error');});window.addEventListener('unhandledrejection',()=>{void captureDiagnostic('unhandled_rejection');});window.addEventListener('online',()=>{void flushDiagnostics();});}
