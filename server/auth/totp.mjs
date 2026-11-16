// Time-based one-time passwords (RFC 6238 on top of RFC 4226), compatible with common authenticator apps.
// Secrets are sealed with AES-256-GCM before they reach the database.
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { authPolicy } from './policy.mjs';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes) {
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  return (bits.match(/.{1,5}/g) ?? []).map((chunk) => alphabet[parseInt(chunk.padEnd(5, '0'), 2)]).join('');
}

export function base32Decode(text) {
  let bits = '';
  for (const letter of String(text).toUpperCase().replace(/=+$/, '')) {
    const value = alphabet.indexOf(letter);
    if (value < 0) throw new Error('Invalid authenticator secret');
    bits += value.toString(2).padStart(5, '0');
  }
  return Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)));
}

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / authPolicy.totp.periodSeconds);

/** The code for one time step (RFC 4226 §5.3 dynamic truncation). */
export function codeAt(secret, step, digits = authPolicy.totp.digits) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hash = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, '0');
}

/**
 * Returns the matching time step, or null.
 * `lastUsedStep` rejects a code that was already accepted (RFC 6238 §5.2: one use per time step).
 */
export function matchingStep(secret, code, lastUsedStep = -1, now = Date.now()) {
  if (!/^\d{6}$/.test(String(code))) return null;
  const drift = authPolicy.totp.allowedDriftSteps;
  for (let step = currentStep(now) - drift; step <= currentStep(now) + drift; step += 1) {
    if (step <= Number(lastUsedStep)) continue;
    const expected = Buffer.from(codeAt(secret, step));
    if (timingSafeEqual(expected, Buffer.from(String(code)))) return step;
  }
  return null;
}

export function newSecret() {
  return base32Encode(randomBytes(authPolicy.totp.secretBytes));
}

/** The otpauth:// address an authenticator app reads from a QR code. */
export function enrolmentUri(secret, accountName) {
  const { issuer, digits, periodSeconds } = authPolicy.totp;
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${digits}&period=${periodSeconds}`;
}

/** Seals and opens secrets with a key derived from AUTH_SECRET, so a database copy alone cannot produce codes. */
export function createSecretBox(applicationSecret) {
  const key = Buffer.from(hkdfSync('sha256', applicationSecret, 'wise-auth', 'totp-secret-v1', 32));
  return {
    seal(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      return [
        'v1',
        iv.toString('base64url'),
        body.toString('base64url'),
        cipher.getAuthTag().toString('base64url'),
      ].join('.');
    },
    open(sealed) {
      const [version, iv, body, tag] = String(sealed).split('.');
      if (version !== 'v1') throw new Error('Unreadable authenticator secret');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
    },
  };
}
