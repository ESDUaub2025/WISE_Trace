import {execSync} from 'node:child_process';
import {setTimeout} from 'node:timers/promises';
import {stdout} from 'node:process';
const status=JSON.parse(execSync('npx supabase status -o json',{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
let ready=false;for(let attempt=0;attempt<60;attempt++){
 try{const response=await globalThis.fetch(status.API_URL+'/functions/v1/sync',{method:'POST',headers:{apikey:status.PUBLISHABLE_KEY??status.ANON_KEY,'Content-Type':'application/json'},body:'{}',signal:globalThis.AbortSignal.timeout(3000)});const body=await response.text();if(!response.ok&&body.includes('Authentication required')){ready=true;break;}}catch{/* Runtime still starting. */}
 await setTimeout(1000);
}
if(!ready)throw new Error('Authenticated Edge handler did not become ready');stdout.write('Edge handler is ready and rejects unauthenticated calls.\n');
