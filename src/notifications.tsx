import {formatLocalDate} from './lib/format';
import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Button} from './components/ui/button';
import type {Row} from './lib/data';
import type {Identity} from './lib/domain';
import {db} from './offline/db';
import {demo,supabase} from './lib/supabase';
import {PushSettings} from './push-settings';

export async function flushNotificationReads(identity:Identity) {
 if(demo||!navigator.onLine||!supabase)return;
 let failure:unknown;
 for(const row of await db.cache.where('key').startsWith(`notification-read:${identity.id}:`).toArray()){
  const {error}=await supabase.rpc('notification_read',{target:row.key.split(':').at(-1)});
  if(error){failure=error;continue;}
  await db.cache.delete(row.key);
 }
 if(failure)throw failure;
}
export function Notifications({rows,identity,onDone}:{rows:Row[];identity:Identity;onDone:()=>Promise<void>}) {
 const {t}=useTranslation();const [read,setRead]=useState<string[]>([]),[error,setError]=useState('');
 return <div className="notification-list"><PushSettings/>{rows.length===0?<p>{t('allClearText')}</p>:rows.map(row=>{
  const payload=(row.payload??{}) as Row;const id=String(row.id);const acknowledged=!!row.read_at||read.includes(id);
  return <article className="card" key={id}><h3>{t(String(row.kind),{defaultValue:t('notifications')})}</h3><p>{t(`notification_${String(row.kind)}`,{defaultValue:t('notification_task')})}</p>{!!payload.lot_code&&<bdi>{String(payload.lot_code)}</bdi>}<time dateTime={String(row.created_at)}>{formatLocalDate(String(row.created_at),document.documentElement.lang)}</time><Button variant="outline" disabled={acknowledged} onClick={async()=>{try{
   await db.cache.put({key:`notification-read:${identity.id}:${id}`,value:new Date().toISOString()});
   setRead(values=>[...values,id]);await flushNotificationReads(identity);await onDone();
  }catch(e){setError(e instanceof Error?e.message:'error');}}}>{t(acknowledged?'notificationRead':'markRead')}</Button></article>;
 })}{error&&<p role="alert" className="error-box">{t(error)}</p>}</div>;
}
