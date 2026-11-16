// Drives the real sign-in screens (src/account) for the live browser tests.
import { expect, type Page } from '@playwright/test';

export const fixturePassword = 'wise-demo-only';
export const fixturePin = '2468';

/** Skips the first-run language question; the tests run in English. */
export async function chooseEnglish(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('wise-language-chosen', '1');
    if (!localStorage.getItem('wise-language')) localStorage.setItem('wise-language', 'en');
  });
}

/** Step 1: username (or email) and password. */
export async function enterPassword(page: Page, identifier: string, password = fixturePassword) {
  await page.getByLabel('Username or email', { exact: true }).fill(identifier);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

/** Final step: the PIN pad. */
export async function enterPin(page: Page, pin = fixturePin) {
  await page.locator('input[name=pin]').fill(pin);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
}

export async function dismissWelcome(page: Page) {
  const welcome = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Welcome to WISE' }) });
  if (await welcome.isVisible()) await welcome.getByRole('button', { name: 'Not now' }).click();
}

/** Producers start in the simple workspace; most tests exercise the full one. */
export async function openFullWorkspace(page: Page) {
  await page.locator('.s-app, .app-layout').first().waitFor();
  if (await page.locator('.s-app').count()) {
    await page.getByRole('button', { name: 'Account', exact: true }).click();
    await page.getByRole('button', { name: /Full workspace/ }).click();
  }
  await expect(page.locator('.app-layout main')).toBeVisible();
  await dismissWelcome(page);
}

/** Password + PIN, ending in the full workspace. */
export async function signInFull(page: Page, identifier: string, password = fixturePassword, pin = fixturePin) {
  await chooseEnglish(page);
  await page.goto('/');
  await reachPasswordForm(page);
  await enterPassword(page, identifier, password);
  await enterPin(page, pin);
  await openFullWorkspace(page);
}

/**
 * Gets to the username and password form whatever the browser's state:
 * nobody known (already there), people remembered (choose "Someone else"), or someone active (lock first).
 * The last two are the shared-phone cases.
 */
export async function reachPasswordForm(page: Page) {
  const form = page.getByLabel('Username or email', { exact: true });
  const someoneElse = page.getByRole('button', { name: 'Someone else', exact: true });
  const workspace = page.locator('.s-app, .app-layout').first();
  await expect(form.or(someoneElse).or(workspace)).toBeVisible();
  if (await workspace.isVisible()) {
    await dismissWelcome(page);
    if (await page.locator('.s-app').count()) await page.getByRole('button', { name: 'Account', exact: true }).click();
    else {
      const menu = page.locator('.topbar .mobile-only');
      if (await menu.isVisible()) await menu.click();
      await page.locator('.person').click();
    }
    await page.getByRole('button', { name: /Lock or switch person/ }).click();
    await page.getByRole('button', { name: 'Go back', exact: true }).click();
  }
  if (!(await form.isVisible())) await someoneElse.click();
}

/** Opens the connection indicator and sends waiting records now (re-checking the connection first if needed). */
export async function syncNow(page: Page) {
  await page
    .getByRole('button', { name: /Show details/ })
    .first()
    .click();
  await page.getByRole('button', { name: /^(Send now|Check again)$/ }).click();
  await expect(page.getByRole('button', { name: /^(Send now|Check again)$/ })).toBeEnabled();
  await page.keyboard.press('Escape');
}
