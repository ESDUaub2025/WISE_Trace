export async function pinHash(pin: string, salt: Uint8Array<ArrayBuffer>) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bytes = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' },
    material,
    256,
  );
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}
export async function createPinVerifier(pin: string) {
  if (!/^\d{4,6}$/.test(pin)) throw new Error('pin_format');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: Array.from(salt), hash: await pinHash(pin, salt) };
}
export async function verifyPin(pin: string, verifier: { salt: number[]; hash: string }) {
  const candidate = await pinHash(pin, new Uint8Array(verifier.salt));
  let difference = candidate.length ^ verifier.hash.length;
  for (let i = 0; i < candidate.length; i++) difference |= candidate.charCodeAt(i) ^ verifier.hash.charCodeAt(i);
  return difference === 0;
}
