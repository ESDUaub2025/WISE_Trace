import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './components/ui/button';
import type { Identity } from './lib/domain';
import { supabase,demo } from './lib/supabase';
import { getDevice,type Snapshot } from './lib/data';

export function RegistryFlow({entity,identity,data,onDone}:{entity:string;identity:Identity;data:Snapshot;onDone:()=>Promise<void>}){
 const {t}=useTranslation();const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const fields:Record<string,string[]>={supplier:['name','type','status','declarations'],equipment:['label','type','calibrated_at','next_due_at'],cooperative:['code','name','region','contacts','sites'],user:['username','display_name','password','pin','roles'],amendment:['lot_id','changes','reason'],stock_count:['lot_id','quantity','reason'],resolve_conflict:['receipt_id','corrected_payload','reason'],training_exception:['user_id','reason','expires_at'],revoke_device:['device_id','reason'],account:['user_id','status','roles','authorizations','reason'],consent:['sex','age_band'],complete_recall:['recall_id','actions']};
 const jsonFields=['declarations','contacts','sites','changes','corrected_payload','authorizations','actions'];
 const defaults:Record<string,string>={status:entity==='supplier'?'provisional':'active',roles:'producer',declarations:'{}',contacts:'{}',sites:'[]',changes:'{}',corrected_payload:'{}',authorizations:'{}',actions:'[{"action":"stop_sale","quantity":0,"notes":"Confirmed"}]'};
 function options(name:string){if(name==='lot_id')return data.lots.map(l=>({id:l.id,label:l.code}));if(name==='user_id')return data.members.map(m=>({id:String(m.user_id??m.id),label:String(m.display_name)}));if(name==='device_id')return data.devices.map(d=>({id:String(d.id),label:String(d.label)}));if(name==='receipt_id')return data.tasks.filter(task=>task.kind==='sync_conflict').map(task=>({id:String(task.details.receipt_id),label:String(task.details.error)}));if(name==='recall_id')return data.recalls.filter(r=>r.status!=='closed').map(r=>({id:String(r.id),label:String(r.reason)}));return null;}
 return <form className="record-form" onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{if(!supabase||demo||!navigator.onLine)throw new Error('onlineRequired');const f=new FormData(event.currentTarget);const value=(key:string)=>String(f.get(key)??'');const payload=Object.fromEntries((fields[entity]??[]).map(field=>[field,jsonFields.includes(field)?JSON.parse(value(field)):value(field)]));let reply;
 if(entity==='user')reply=await supabase.functions.invoke('user-admin',{body:{...payload,roles:value('roles').split(',').map(r=>r.trim()),cooperative_id:identity.cooperative_id,authorizations:{receive_whey:f.has('receive_whey')}}});
 else if(entity==='cooperative')reply=await supabase.rpc('manage_cooperative',{target:crypto.randomUUID(),payload});
 else if(['supplier','equipment'].includes(entity))reply=await supabase.rpc('manage_registry',{entity,target:crypto.randomUUID(),payload:{...payload,cooperative_id:identity.cooperative_id}});
 else if(entity==='amendment')reply=await supabase.rpc('record_amendment',{target:value('lot_id'),changes:payload.changes,reason:value('reason'),device:await getDevice()});
 else if(entity==='stock_count')reply=await supabase.rpc('reconcile_stock',{target:value('lot_id'),counted:Number(value('quantity')),reason:value('reason'),device:await getDevice()});
 else if(entity==='resolve_conflict')reply=await supabase.rpc('resolve_sync_conflict',{target:value('receipt_id'),corrected_payload:payload.corrected_payload,reason:value('reason')});
 else if(entity==='training_exception')reply=await supabase.rpc('grant_training_exception',{target:value('user_id'),reason:value('reason'),expires:new Date(value('expires_at')).toISOString(),supervised:true});
 else if(entity==='revoke_device')reply=await supabase.rpc('revoke_device',{target:value('device_id'),reason:value('reason')});
 else if(entity==='account')reply=await supabase.rpc('manage_account',{target:value('user_id'),status:value('status'),roles:value('roles').split(',').map(r=>r.trim()),authorizations:payload.authorizations,reason:value('reason')});
 else if(entity==='consent')reply=await supabase.rpc('record_consent',{sex:value('sex'),age_band:value('age_band'),consent:f.has('consent')});
 else if(entity==='complete_recall')reply=await supabase.rpc('complete_recall',{target:value('recall_id'),actions:payload.actions});
 else throw new Error('error');if(reply?.error)throw reply.error;await onDone();
 }catch(e){setError(e instanceof Error?e.message:'error');}finally{setBusy(false);}}}>
 {(fields[entity]??[]).map(name=>{const choices=options(name);return <label key={name}>{t(name)}{choices?<select name={name} required>{choices.map(choice=><option key={choice.id} value={choice.id}>{choice.label}</option>)}</select>:jsonFields.includes(name)?<textarea name={name} rows={5} defaultValue={defaults[name]} required className="mono"/>:<input name={name} type={['password','pin'].includes(name)?'password':['calibrated_at','next_due_at','expires_at'].includes(name)?'datetime-local':name==='quantity'?'number':'text'} defaultValue={defaults[name]} required/>}</label>;})}
 {entity==='user'&&<label className="checkbox"><input name="receive_whey" type="checkbox"/>{t('authorization')} · {t('whey')}</label>}{entity==='consent'&&<label className="checkbox"><input name="consent" type="checkbox"/>{t('consent')}</label>}{error&&<p className="error-box" role="alert">{t(error)}</p>}<Button disabled={busy||!navigator.onLine||demo}>{t(busy?'loading':'save')}</Button></form>;
}
