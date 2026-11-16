import type { Envelope } from '../lib/domain';
export interface SealedSecret {
  salt: number[];
  iv: number[];
  ciphertext: number[];
}
export interface OfflineCredential {
  id: string;
  expires_at: string;
  sealed: SealedSecret;
}
async function wrappingKey(pin: string, salt: Uint8Array<ArrayBuffer>) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' },
    key,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function sealSecret(secret: string, pin: string): Promise<SealedSecret> {
  const salt = crypto.getRandomValues(new Uint8Array(32)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await wrappingKey(pin, salt),
    new TextEncoder().encode(secret),
  );
  return { salt: Array.from(salt), iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(encrypted)) };
}
export async function openSecret(sealed: SealedSecret, pin: string) {
  const bytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(sealed.iv) },
    await wrappingKey(pin, new Uint8Array(sealed.salt)),
    new Uint8Array(sealed.ciphertext),
  );
  return new TextDecoder().decode(bytes);
}
export async function decisionProof(envelope: Envelope, secret: string) {
  const p = envelope.payload;
  const message = [
    envelope.id,
    envelope.cooperative_id,
    envelope.author_id,
    envelope.device_id,
    envelope.config_version_id,
    p.lot_id,
    envelope.observed_at,
    p.outcome,
    p.reason,
  ].join('\n');
  const raw = Uint8Array.from(secret.match(/.{2}/g) ?? [], (byte) => parseInt(byte, 16));
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const proof = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(proof), (b) => b.toString(16).padStart(2, '0')).join('');
}
