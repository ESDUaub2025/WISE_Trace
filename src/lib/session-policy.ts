import { db } from '../offline/db';
import type { Config } from './domain';
export interface SessionLimits { offlineDays:number; inactivityMinutes:number; }
export function sessionLimits(definition?:Config['definition']):SessionLimits{
 return {offlineDays:Math.max(1,Math.min(30,Number(definition?.session_offline_days??7))),inactivityMinutes:Math.max(1,Math.min(1440,Number(definition?.session_inactivity_minutes??30)))};
}
export function offlineExpired(authenticatedAt:number,now:number,limits:SessionLimits){return now-authenticatedAt>limits.offlineDays*86400000;}
export function inactive(lastActivity:number,now:number,limits:SessionLimits){return now-lastActivity>limits.inactivityMinutes*60000;}
export async function cachedSessionLimits(id:string){const snapshot=(await db.cache.get(`snapshot:${id}`))?.value as {config:Config}|undefined;return sessionLimits(snapshot?.config.definition);}
export function markActive(id:string){sessionStorage.setItem(`last-activity:${id}`,String(Date.now()));}
