// Signs a whey decision made without a connection (PRD §10.1: allowed when the same device received the whey).
// The server issued a secret at the last online unlock; it is stored sealed with the PIN, so the
// signature proves the PIN was entered on this device. The server verifies it when the record syncs.
import { openSecret, decisionProof } from './sealed-ticket';
import { verifyPin } from './pin';
import { getProfile } from './profiles';
import type { Envelope } from '../lib/domain';

/** Wrong PINs allowed per browser tab before signing is refused. */
const maxAttempts = 5;

export async function signOfflineDecision(envelope: Envelope, pin: string) {
  const profile = await getProfile(envelope.author_id);
  const credential = profile?.offlineCredential;
  if (!profile || !credential || Date.parse(credential.expires_at) < Date.now())
    throw new Error('offlineSignatureMissing');
  const key = `signature-attempts:${envelope.author_id}`;
  const attempts = Number(sessionStorage.getItem(key) ?? 0);
  if (attempts >= maxAttempts) throw new Error('pinLocked');
  if (!(await verifyPin(pin, profile.verifier))) {
    sessionStorage.setItem(key, String(attempts + 1));
    throw new Error('pinFailed');
  }
  const secret = await openSecret(credential.sealed, pin);
  sessionStorage.removeItem(key);
  return { credential_id: credential.id, proof: await decisionProof(envelope, secret) };
}
