import {useEffect,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Button} from './components/ui/button';
import {getDevice} from './lib/data';
import {demo,supabase} from './lib/supabase';

export function PushSettings() {
 const {t}=useTranslation();const [busy,setBusy]=useState(false),[enabled,setEnabled]=useState(false),[error,setError]=useState('');
 const key=String(import.meta.env.VITE_VAPID_PUBLIC_KEY??'');
 const supported='serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
 useEffect(()=>{if(supabase&&!demo)void getDevice().then(async device=>{const result=await supabase!.from('push_subscription').select('enabled').eq('device_id',device);setEnabled(result.data?.some(row=>row.enabled)??false);});},[]);
 return <section className="card push-settings"><h3>{t('webPush')}</h3><p>{t(!supported?'pushUnsupported':!key?'pushNotConfigured':'pushSharedDevice')}</p><Button variant="outline" disabled={busy||!supported||!key||demo||!navigator.onLine} onClick={async()=>{
  setBusy(true);setError('');try{
   if(!supabase)throw new Error('setup');const registration=await navigator.serviceWorker.ready;
   if(enabled){const saved=await supabase.rpc('register_push_subscription',{device:await getDevice(),subscription:{},enabled:false});if(saved.error)throw saved.error;await (await registration.pushManager.getSubscription())?.unsubscribe();setEnabled(false);}
   else{
    if(await Notification.requestPermission()!=='granted')throw new Error('pushPermissionDenied');
    const publicKey=Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    const subscription=await registration.pushManager.getSubscription()??await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicKey});
    const saved=await supabase.rpc('register_push_subscription',{device:await getDevice(),subscription:subscription.toJSON(),enabled:true});if(saved.error)throw saved.error;setEnabled(true);
   }
  }catch(e){setError(e instanceof Error?e.message:'error');}finally{setBusy(false);}
 }}>{t(enabled?'disablePush':'enablePush')}</Button>{error&&<p className="error-box" role="alert">{t(error)}</p>}</section>;
}
