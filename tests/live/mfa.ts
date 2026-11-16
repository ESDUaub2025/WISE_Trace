import { resetMfa } from './client';
import { expect, type Page } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { client } from './fixtures';
import { chooseEnglish, enterPassword, enterPin, openFullWorkspace } from './sign-in';

// RFC 6238 / RFC 4226, using the fresh local test account's authenticator secret.
function totp(secret: string) {
  let bits = '';
  for (const char of secret.toUpperCase().replace(/=+$/, '')) {
    const index = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char);
    if (index < 0) throw Error('Invalid test authenticator');
    bits += index.toString(2).padStart(5, '0');
  }
  const key = Buffer.from(
    Array.from({ length: Math.floor(bits.length / 8) }, (_, i) => parseInt(bits.slice(i * 8, i * 8 + 8), 2)),
  );
  const time = Buffer.alloc(8);
  time.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac('sha1', key).update(time).digest();
  const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
/** Signs in an administrator or Food-Safety Lead, setting up a fresh authenticator on the way. */
export async function loginMfa(page: Page, username: string) {
  await resetMfa(username);
  await chooseEnglish(page);
  await page.goto('/');
  await enterPassword(page, username);
  await expect(page.locator('.acct-secret')).toBeVisible();
  const secret = (await page.locator('.acct-secret').innerText()).trim();
  await page.locator('input[name=totp]').fill(totp(secret));
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await enterPin(page);
  await openFullWorkspace(page);
  const c = client(page.request);
  expect(await c.session.assurance()).toBe('aal2');
  return c;
}
