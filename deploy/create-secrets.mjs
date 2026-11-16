import { randomBytes, randomInt } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { demoConfig } from '../src/lib/demo.ts';
await mkdir(new URL('../secrets/', import.meta.url), { recursive: true });
const root = new URL('../secrets/', import.meta.url);
const account = (username, display_name) => ({
  username,
  display_name,
  password: randomBytes(24).toString('base64url'),
  pin: String(randomInt(100000, 1000000)),
});
const input = {
  cooperative: { code: 'WISEADMIN', name: 'WISE Platform Administration', region: 'Lebanon' },
  admin: account('wise_admin', 'Project administrator'),
  food_safety: account('wise_food_safety', 'Food-safety lead'),
  configuration: demoConfig.definition,
};
await writeFile(new URL('production.bootstrap.json', root), JSON.stringify(input, null, 2), {
  mode: 0o600,
  flag: 'wx',
});
const environment = `RELEASE=local\nSITE_ADDRESS=wise.13.221.70.85.sslip.io\nAPP_ORIGIN=https://wise.13.221.70.85.sslip.io\nACME_EMAIL=jabernizar98@gmail.com\nDATABASE_PASSWORD=${randomBytes(32).toString('hex')}\nAPP_DATABASE_PASSWORD=${randomBytes(32).toString('hex')}\nAUTH_SECRET=${randomBytes(32).toString('hex')}\nSMTP_URL=\nMAIL_FROM=\n`;
await writeFile(new URL('production.env', root), environment, { mode: 0o600, flag: 'wx' });
process.stdout.write('Production credentials saved under secrets/. No secret values printed.\n');
