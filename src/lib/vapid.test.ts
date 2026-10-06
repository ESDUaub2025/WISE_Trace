import {afterEach,expect,it,vi} from 'vitest';
import {pushEndpoint,sendPush,vapidAuthorization} from '../../supabase/functions/_shared/vapid';

const encode=(bytes:Uint8Array)=>Buffer.from(bytes).toString('base64url');
async function keys() {
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',pair.privateKey);
 return {pair,config:{subject:'mailto:notifications@example.invalid',publicKey:encode(new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey))),privateKey:jwk.d!}};
}
afterEach(()=>vi.unstubAllGlobals());
it('signs a verifiable VAPID token for the exact provider origin with bounded expiry',async()=>{
 const {pair,config}=await keys();const now=Date.now();const authorization=await vapidAuthorization('https://fcm.googleapis.com/push/test',config,now);
 const token=/^vapid t=([^,]+), k=/.exec(authorization)![1];const [header,claims,signature]=token.split('.');
 expect(JSON.parse(Buffer.from(header,'base64url').toString())).toMatchObject({alg:'ES256'});
 expect(JSON.parse(Buffer.from(claims,'base64url').toString())).toEqual({aud:'https://fcm.googleapis.com',exp:Math.floor(now/1000)+43200,sub:config.subject});
 expect(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pair.publicKey,Buffer.from(signature,'base64url'),new TextEncoder().encode(header+'.'+claims))).toBe(true);
});
it('rejects private destinations, userinfo, unapproved hosts and alternate ports',()=>{
 for(const url of ['http://127.0.0.1','https://fcm.googleapis.com.attacker.invalid/a','https://user@fcm.googleapis.com/a','https://fcm.googleapis.com:8443/a'])expect(()=>pushEndpoint(url)).toThrow();
 expect(pushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/test').hostname).toBe('updates.push.services.mozilla.com');
});
it('sends no payload or encryption secrets, disables redirects and retains provider status',async()=>{
 const {config}=await keys();const fetch=vi.fn().mockResolvedValue(new Response(null,{status:201}));vi.stubGlobal('fetch',fetch);
 await sendPush('https://fcm.googleapis.com/test',config);
 const options=fetch.mock.calls[0][1];expect(options.body).toBeUndefined();expect(options.redirect).toBe('error');expect(JSON.stringify(options.headers)).not.toContain(config.privateKey);
 fetch.mockResolvedValue(new Response(null,{status:410}));await expect(sendPush('https://fcm.googleapis.com/test',config)).rejects.toMatchObject({statusCode:410});
});
