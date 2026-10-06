import {db} from '../offline/db';
import {openSecret,decisionProof,type OfflineCredential} from './sealed-ticket';
import {verifyPin} from './pin';
import type {Envelope} from './domain';
export async function signOfflineDecision(envelope:Envelope,pin:string){
 const cached=(await db.cache.get(`session:${envelope.author_id}`))?.value as {offline_credential?:OfflineCredential;verifier:{salt:number[];hash:string}}|undefined;
 const credential=cached?.offline_credential;if(!credential||Date.parse(credential.expires_at)<Date.now())throw new Error('offlineSignatureMissing');
 const key=`signature-attempts:${envelope.author_id}`;const attempts=Number(sessionStorage.getItem(key)??0);if(attempts>=5)throw new Error('authFailed');
 if(!await verifyPin(pin,cached!.verifier)){sessionStorage.setItem(key,String(attempts+1));throw new Error('authFailed');}
 const secret=await openSecret(credential.sealed,pin);sessionStorage.removeItem(key);return{credential_id:credential.id,proof:await decisionProof(envelope,secret)};
}
