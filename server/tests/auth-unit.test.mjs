// Unit tests for the authentication building blocks. No database needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, needsRehash, verifyPassword, assertPasswordAllowed } from '../auth/passwords.mjs';
import {
  base32Encode,
  base32Decode,
  codeAt,
  matchingStep,
  createSecretBox,
  enrolmentUri,
  currentStep,
} from '../auth/totp.mjs';
import { authPolicy } from '../auth/policy.mjs';

test('passwords: hash verifies, wrong password fails, hashes are salted', async () => {
  const hash = await hashPassword('correct horse battery');
  assert.match(hash, /^scrypt\$16\$8\$2\$/);
  assert.equal(await verifyPassword('correct horse battery', hash), true);
  assert.equal(await verifyPassword('correct horse batterx', hash), false);
  assert.notEqual(hash, await hashPassword('correct horse battery'));
  assert.equal(needsRehash(hash), false);
  assert.equal(needsRehash('scrypt$14$8$1$c2FsdA$aGFzaA'), true);
});

test('passwords: malformed stored values never verify and length limits are enforced', async () => {
  for (const stored of ['', null, 'plain', 'bcrypt$x$y'])
    assert.equal(await verifyPassword('anything-long-enough', stored), false);
  assert.throws(() => assertPasswordAllowed('short'), /passwordLength/);
  assert.throws(() => assertPasswordAllowed('x'.repeat(authPolicy.password.maxLength + 1)), /passwordLength/);
  assert.doesNotThrow(() => assertPasswordAllowed('x'.repeat(authPolicy.password.minLength)));
});

test('TOTP matches the RFC 6238 SHA-1 test vectors', () => {
  // RFC 6238 Appendix B: secret "12345678901234567890", 8 digits.
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  const vectors = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ];
  for (const [seconds, expected] of vectors) assert.equal(codeAt(secret, Math.floor(seconds / 30), 8), expected);
  assert.deepEqual(base32Decode(secret), Buffer.from('12345678901234567890'));
});

test('TOTP accepts the current window once and rejects replays and bad input', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  const now = 1_700_000_000_000;
  const step = currentStep(now);
  assert.equal(matchingStep(secret, codeAt(secret, step), -1, now), step);
  assert.equal(matchingStep(secret, codeAt(secret, step - 1), -1, now), step - 1, 'one step of clock drift is allowed');
  assert.equal(matchingStep(secret, codeAt(secret, step - 2), -1, now), null);
  assert.equal(matchingStep(secret, codeAt(secret, step), step, now), null, 'a used code is refused');
  for (const bad of ['', '12345', 'abcdef', '1234567', null]) assert.equal(matchingStep(secret, bad, -1, now), null);
});

test('authenticator secrets are sealed and tamper-evident', () => {
  const box = createSecretBox('a'.repeat(32));
  const sealed = box.seal('JBSWY3DPEHPK3PXP');
  assert.equal(sealed.includes('JBSWY3DPEHPK3PXP'), false);
  assert.equal(box.open(sealed), 'JBSWY3DPEHPK3PXP');
  assert.throws(() => createSecretBox('b'.repeat(32)).open(sealed));
  assert.match(
    enrolmentUri('JBSWY3DPEHPK3PXP', 'rima'),
    /^otpauth:\/\/totp\/WISE%3Arima\?secret=JBSWY3DPEHPK3PXP&issuer=WISE/,
  );
});
