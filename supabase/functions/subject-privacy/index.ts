import {authenticate,json} from '../_shared/http.ts';
import {z} from 'npm:zod@4.6.5';
Deno.serve(async request=>{if(request.method==='OPTIONS')return json({});if(request.method!=='POST')return json({error:'POST required'},405);try{
 const {user,admin}=await authenticate(request);const body=z.object({target:z.uuid(),reason:z.string().min(3)}).parse(await request.json());
 const changed=await user.rpc('anonymize_producer',body);if(changed.error)throw changed.error;
 const previous=await admin.auth.admin.getUserById(body.target);if(previous.error)throw new Error('Profile anonymized; identity cleanup needs retry');
 const cleared=Object.fromEntries(Object.keys(previous.data.user.user_metadata??{}).map(key=>[key,null]));
 const updated=await admin.auth.admin.updateUserById(body.target,{email:`anon_${body.target.replaceAll('-','')}@users.wise.invalid`,email_confirm:true,user_metadata:cleared,ban_duration:'876000h'});if(updated.error)throw new Error('Profile anonymized; identity cleanup needs retry');
 return json({anonymized:true});
 }catch(e){return json({error:e instanceof Error?e.message:typeof e==='object'&&e!==null&&'message' in e?String(e.message):'Privacy request failed'},400);}});
