import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import { stdout, argv } from 'node:process';
const subject = argv[2];
if (!subject || !/^mailto:[^\s@]+@[^\s@]+$/.test(subject))
  throw new Error('Usage: node scripts/generate-vapid.mjs mailto:notifications@your-domain');
const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', keys.publicKey)).toString('base64url');
const privateKey = (await crypto.subtle.exportKey('jwk', keys.privateKey)).d;
await writeFile(
  resolve('.vapid.env'),
  `VAPID_SUBJECT=${subject}\nVAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}\n`,
  { encoding: 'utf8', mode: 0o600, flag: 'wx' },
);
stdout.write(
  'Saved a new key pair to ignored .vapid.env. Keep the private key on the server; copy only the public key to VITE_VAPID_PUBLIC_KEY.\n',
);
