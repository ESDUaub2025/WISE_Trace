import { it, expect } from 'vitest';
import { sealSecret, openSecret, decisionProof } from './sealed-ticket';
import { ids } from '../lib/demo';
import type { Envelope } from '../lib/domain';
it('encrypts an offline signing secret with the reentered PIN and rejects the wrong PIN', async () => {
  const secret = 'ab'.repeat(32);
  const sealed = await sealSecret(secret, '2468');
  expect(JSON.stringify(sealed)).not.toContain(secret);
  expect(await openSecret(sealed, '2468')).toBe(secret);
  await expect(openSecret(sealed, '0000')).rejects.toThrow();
});
it('binds offline proof to the lot, decision, reason and immutable record identity', async () => {
  const e: Envelope = {
    id: crypto.randomUUID(),
    cooperative_id: ids.coop,
    author_id: ids.producer,
    device_id: ids.device,
    config_version_id: ids.config,
    observed_at: new Date().toISOString(),
    action: 'whey_decision',
    payload: { lot_id: ids.whey, outcome: 'accepted', reason: 'Within thresholds' },
  };
  const secret = 'ab'.repeat(32),
    proof = await decisionProof(e, secret);
  expect(proof).toHaveLength(64);
  expect(await decisionProof({ ...e, payload: { ...e.payload, outcome: 'rejected' } }, secret)).not.toBe(proof);
  expect(await decisionProof({ ...e, id: crypto.randomUUID() }, secret)).not.toBe(proof);
});
