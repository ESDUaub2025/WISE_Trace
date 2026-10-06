import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { db } from '../offline/db';
import { createPinVerifier,verifyPin } from './pin';
import { getDevice } from './data';
import type { Identity } from './domain';
import { verifyMfa } from './mfa';
import { cachedSessionLimits,offlineExpired,markActive } from './session-policy';
import {sealSecret,type OfflineCredential} from './sealed-ticket';
interface LocalSession { identity: Identity; session: Session; verifier: {salt:number[];hash:string}; authenticated_at: number; offline_credential?:OfflineCredential; }
supabase?.auth.onAuthStateChange((_event,session)=>{if(session)void db.cache.get(`session:${session.user.id}`).then(row=>{if(row){const local=row.value as LocalSession;return db.cache.put({key:row.key,value:{...local,session}});}});});
export async function login(username:string,password:string,pin:string,factorId?:string,totpCode?:string):Promise<Identity>{
 if(!supabase)throw new Error('setup');
 if(!/^[a-z0-9._-]{3,40}$/.test(username))throw new Error('authFailed');
 const {data,error}=await supabase.auth.signInWithPassword({email:`${username}@users.wise.invalid`,password});if(error||!data.session)throw new Error('authFailed');
 const profile=await supabase.from('membership').select('*').eq('user_id',data.user.id).single();if(profile.error)throw new Error('authFailed');
 const identity={...profile.data,id:profile.data.user_id} as Identity;
 if(identity.roles.some(r=>r==='admin'||r==='food_safety')){
 if(factorId&&totpCode)await verifyMfa(factorId,totpCode);
 const assurance=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();if(assurance.data?.currentLevel!=='aal2')throw new Error('signatureRequired');
 }
 const device=await getDevice();const registered=await supabase.rpc('register_device',{target:device,label:username+' device'});if(registered.error)throw registered.error;
 const sign=await supabase.rpc('pin_signoff',{pin,device,action:'cache_session',object_id:identity.id});if(sign.error||!sign.data)throw new Error('authFailed');
 const current=await supabase.auth.getSession();
 const local:LocalSession={identity,session:current.data.session??data.session,verifier:await createPinVerifier(pin),authenticated_at:Date.now()};
 if(identity.roles.includes('supervisor')||(identity.roles.includes('producer')&&identity.authorizations.receive_whey)){const issued=await supabase.rpc('issue_offline_credential',{device,sign:sign.data});if(issued.error)throw issued.error;local.offline_credential={id:issued.data.id,expires_at:issued.data.expires_at,sealed:await sealSecret(issued.data.secret,pin)};}
 await db.cache.put({key:`session:${identity.id}`,value:local});await db.cache.put({key:'identity',value:identity});markActive(identity.id);return identity;
}
export async function switchUser(id:string,pin:string){
 const local=(await db.cache.get(`session:${id}`))?.value as LocalSession|undefined;
 if(!local)throw new Error('userNotCached');if(offlineExpired(local.authenticated_at,Date.now(),await cachedSessionLimits(id)))throw new Error('sessionExpired');
 const key=`pin-attempts:${id}`;const failure=(await db.cache.get(key))?.value as {attempts:number;blockedUntil:number}|undefined;
 if(failure&&failure.blockedUntil>Date.now())throw new Error('pinLocked');
 const attempts=failure?.blockedUntil&&failure.blockedUntil<=Date.now()?0:failure?.attempts??0;
 if(!await verifyPin(pin,local.verifier)){await db.cache.put({key,value:{attempts:attempts+1,blockedUntil:attempts+1>=5?Date.now()+15*60000:0}});throw new Error('authFailed');}
 await db.cache.delete(key);
 if(navigator.onLine&&supabase){const session=await supabase.auth.setSession(local.session);if(session.error)throw session.error;}
 await db.cache.put({key:'identity',value:local.identity});markActive(id);return local.identity;
}
export async function logout(){await supabase?.auth.signOut({scope:'local'});await db.cache.delete('identity');}
