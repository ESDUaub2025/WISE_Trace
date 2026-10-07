import {useEffect,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Button} from './components/ui/button';
import {supabase} from './lib/supabase';

export function Registration({onBack,complete=false,trial=false}:{onBack:()=>void;complete?:boolean;trial?:boolean}){
 const {t}=useTranslation();const [busy,setBusy]=useState(false),[error,setError]=useState(''),[sent,setSent]=useState(false),[submitted,setSubmitted]=useState(false);
 if(submitted)return <RegistrationStatus onBack={onBack}/>;
 return <div className="login-page"><div className="login-card"><img src="/wise.svg" width={56} alt="WISE"/><h1>{t(complete?'finishRegistration':'signUp')}</h1><p>{t('registrationIntro')}</p>{sent?<p role="status">{t('registrationEmailSent')}</p>:<form onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');const form=new FormData(event.currentTarget);const value=(key:string)=>String(form.get(key)??'').trim();try{
 if(!supabase||!navigator.onLine)throw new Error('onlineRequired');
 const email=value('email').toLowerCase();const password=String(form.get('password')??'');
 if(!complete){const response=await supabase.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin+'/',data:{display_name:value('display_name')}}});if(response.error)throw response.error;if(!response.data.session){setSent(true);return;}}
 const response=await supabase.rpc('request_registration',{account_username:value('username'),account_name:value('display_name'),workspace_name:value('workspace_name'),workspace_region:value('workspace_region'),account_pin:value('pin'),requested_plan:value('requested_plan')});if(response.error)throw response.error;
 setSubmitted(true);
 }catch(e){setError(e instanceof Error?e.message:'authFailed');}finally{setBusy(false);}}}>
 {!complete&&<><label>{t('email')}<input name="email" type="email" required autoComplete="email" maxLength={254}/></label><label>{t('password')}<input name="password" type="password" required minLength={12} autoComplete="new-password"/></label></>}
 <label>{t('username')}<input name="username" required pattern="[a-z0-9._\-]{3,40}" minLength={3} maxLength={40} autoComplete="username"/></label><label>{t('display_name')}<input name="display_name" required minLength={2} maxLength={100} autoComplete="name"/></label><label>{t('workspaceName')}<input name="workspace_name" required minLength={3} maxLength={100}/></label><label>{t('region')}<input name="workspace_region" required minLength={2} maxLength={100}/></label><label>{t('pin')}<input name="pin" type="password" required inputMode="numeric" pattern="[0-9]{4,6}" autoComplete="off"/></label>
 <label>{t('accessPlan')}<select name="requested_plan" defaultValue={trial?'trial':'full'}><option value="trial">{t('freeTrial')}</option><option value="full">{t('fullService')}</option></select></label><p>{t('registrationScope')}</p>{error&&<p className="error-box" role="alert">{t(error)}</p>}<Button type="submit" disabled={busy}>{t(busy?'loading':complete?'finishRegistration':'signUp')}</Button>
 </form>}<Button type="button" variant="ghost" onClick={onBack}>{t('backToSignIn')}</Button></div></div>;
}

export function RegistrationStatus({onBack}:{onBack:()=>void}){
 const {t}=useTranslation();const [status,setStatus]=useState('pending'),[reason,setReason]=useState(''),[error,setError]=useState('');
 const refresh=async()=>{const response=await supabase?.from('registration_request').select('status,review_reason').single();if(response?.error)setError(response.error.message);else if(response?.data){setStatus(response.data.status);setReason(response.data.review_reason??'');}};
 useEffect(()=>{let active=true;void supabase?.from('registration_request').select('status,review_reason').single().then(response=>{if(active&&response.data){setStatus(response.data.status);setReason(response.data.review_reason??'');}});return()=>{active=false;};},[]);
 return <div className="login-page"><div className="login-card"><h1>{t('registrationStatus')}</h1><p role="status">{t('registration_'+status)}</p>{reason&&<p>{reason}</p>}{error&&<p className="error-box" role="alert">{t(error)}</p>}<div className="button-group"><Button type="button" onClick={()=>void refresh()}>{t('refreshStatus')}</Button><Button type="button" variant="outline" onClick={async()=>{await supabase?.auth.signOut({scope:'local'});onBack();}}>{t('backToSignIn')}</Button></div></div></div>;
}
