import {execSync} from 'node:child_process';
import {existsSync,writeFileSync} from 'node:fs';
import {stdout} from 'node:process';
const status=JSON.parse(execSync('npx supabase status -o json',{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
if(!existsSync('.env.local'))writeFileSync('.env.local',`VITE_SUPABASE_URL=${status.API_URL}\nVITE_SUPABASE_PUBLISHABLE_KEY=${status.PUBLISHABLE_KEY??status.ANON_KEY}\nVITE_DEMO_MODE=false\n`);
stdout.write('Local frontend environment configured; server secrets were not written.\n');
