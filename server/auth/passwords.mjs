// Password hashing with scrypt from Node's standard library.
// Stored form: scrypt$<logN>$<r>$<p>$<salt>$<hash>, so the cost can be raised later
// without invalidating existing passwords (see needsRehash).
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { authPolicy } from './policy.mjs';

// One hash at a time: each uses about 64 MiB, and the API container is small.
let queue = Promise.resolve();

function derive(password, salt, { logN, r, p, keyLength }) {
  const options = { N: 2 ** logN, r, p, maxmem: 256 * 2 ** logN * r };
  const run = () =>
    new Promise((resolve, reject) => {
      // NFKC so the same typed password matches across keyboards (NIST SP 800-63B §5.1.1.2).
      scrypt(password.normalize('NFKC'), salt, keyLength, options, (error, key) =>
        error ? reject(error) : resolve(key),
      );
    });
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}

export function assertPasswordAllowed(password) {
  const { minLength, maxLength } = authPolicy.password;
  if (typeof password !== 'string' || password.length < minLength || password.length > maxLength) {
    throw Object.assign(new Error('passwordLength'), { statusCode: 400 });
  }
}

export async function hashPassword(password) {
  const cost = authPolicy.password.scrypt;
  const salt = randomBytes(cost.saltLength);
  const key = await derive(password, salt, cost);
  return ['scrypt', cost.logN, cost.r, cost.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

function parse(stored) {
  const [scheme, logN, r, p, salt, hash] = String(stored ?? '').split('$');
  if (scheme !== 'scrypt' || !hash) return null;
  return {
    logN: Number(logN),
    r: Number(r),
    p: Number(p),
    salt: Buffer.from(salt, 'base64url'),
    hash: Buffer.from(hash, 'base64url'),
  };
}

export async function verifyPassword(password, stored) {
  const parsed = parse(stored);
  if (!parsed || typeof password !== 'string' || password.length > authPolicy.password.maxLength) return false;
  const candidate = await derive(password, parsed.salt, { ...parsed, keyLength: parsed.hash.length });
  return candidate.length === parsed.hash.length && timingSafeEqual(candidate, parsed.hash);
}

/** True when a stored hash was made with weaker settings than the current policy. */
export function needsRehash(stored) {
  const parsed = parse(stored);
  const cost = authPolicy.password.scrypt;
  return !parsed || parsed.logN < cost.logN || parsed.r < cost.r || parsed.p < cost.p;
}

// Verified against when the account does not exist, so a wrong username takes as long as a wrong password.
let decoy;
export async function spendVerificationTime(password) {
  decoy ??= await hashPassword(randomBytes(18).toString('base64url'));
  await verifyPassword(String(password ?? ''), decoy);
}
