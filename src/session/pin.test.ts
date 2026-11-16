import { expect, it } from 'vitest';
import { createPinVerifier, verifyPin } from './pin';
it('stores salted hashes and checks the personal PIN', async () => {
  const one = await createPinVerifier('2468');
  const two = await createPinVerifier('2468');
  expect(one.hash).not.toBe(two.hash);
  expect(await verifyPin('2468', one)).toBe(true);
  expect(await verifyPin('0000', one)).toBe(false);
  expect(JSON.stringify(one)).not.toContain('2468');
});
