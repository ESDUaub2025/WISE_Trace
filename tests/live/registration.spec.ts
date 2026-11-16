import { chooseEnglish, enterPassword, enterPin, openFullWorkspace } from './sign-in';
const password = 'Acceptance-Signup-2026';
import { resetMfa } from './client';
import { test, expect } from '@playwright/test';
import { serviceClient } from './fixtures';
import { loginMfa } from './mfa';
import { confirmEmail } from './client';

test('verified signup waits for administrator approval and an empty online trial saves actual entries', async ({
  page,
  browser,
}) => {
  const unique = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  const username = 'trial_' + unique,
    email = username + '@example.invalid',
    workspace = 'Workspace ' + unique;
  await chooseEnglish(page);
  await page.goto('/');
  // Step 1: an account with a verified email.
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Trial owner');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Check your email');
  await confirmEmail(email);
  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  // Step 2: signing in leads straight to the workspace request.
  await enterPassword(page, email, password);
  await expect(page.getByRole('heading', { name: 'Complete your access request', exact: true })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill('Trial owner');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Workspace name', { exact: true }).fill(workspace);
  await page.getByLabel('Region', { exact: true }).fill('Test region');
  await page.getByLabel('Choose a PIN (4 to 6 digits)', { exact: true }).fill('2468');
  await page.locator('select[name=requested_plan]').selectOption('trial');
  await page.locator('form button:not([type=button])').click();
  await expect(page.getByRole('heading', { name: 'Your access request', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('waiting for the project administrator');
  await expect(page.locator('.app-layout')).toHaveCount(0);
  const service = serviceClient();
  const request = await service.from('registration_request').select('*').eq('username', username).single();
  if (request.error) throw request.error;
  const person = request.data.user_id;
  expect((await service.from('membership').select('*').eq('user_id', person)).data).toHaveLength(0);
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await loginMfa(adminPage, 'admin1');
  try {
    await adminPage.goto('/admin');
    const card = adminPage.locator('.registration-review article').filter({ hasText: workspace });
    await expect(card).toBeVisible();
    await card.getByLabel('Reason / justification', { exact: true }).fill('Verified applicant for online trial');
    await card.getByRole('button', { name: 'Approve free trial', exact: true }).click();
    await expect(card).toHaveCount(0);
    // Approval is noticed on refresh and leads back to the sign-in.
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Your workspace is approved');
    async function signIn() {
      await enterPassword(page, email, password);
      await enterPin(page);
      await openFullWorkspace(page);
    }
    await signIn();
    await expect(page.locator('.demo-banner')).toContainText('Free online trial');
    await page.goto('/whey');
    await expect(page.locator('tbody tr')).toHaveCount(0);
    const membership = await service.from('membership').select('cooperative_id,roles').eq('user_id', person).single();
    if (membership.error) throw membership.error;
    const cooperative = membership.data.cooperative_id;
    expect(membership.data.roles).toEqual(['manager', 'producer']);
    expect((await service.from('lot').select('id').eq('cooperative_id', cooperative)).data).toHaveLength(0);
    await page.getByRole('button', { name: 'Supplier', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[name=name]').fill('My packaging supplier');
    await dialog.locator('select[name=type]').selectOption('packaging');
    await dialog.locator('select[name=status]').selectOption('approved');
    await dialog.getByRole('button', { name: 'Save record', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: 'Receive material', exact: true }).click();
    await dialog.locator('select[name=type]').selectOption('packaging_material');
    await dialog.getByLabel('Quantity', { exact: true }).fill('20');
    await dialog.getByRole('button', { name: 'Save record', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(async () => {
        const reply = await service.from('lot').select('code').eq('cooperative_id', cooperative);
        return reply.data?.length;
      })
      .toBe(1);
    const lot = (await service.from('lot').select('code').eq('cooperative_id', cooperative).single()).data!;
    await page.reload();
    await expect(page.getByRole('button', { name: lot.code, exact: true })).toBeVisible();
    await page.locator('.topbar .mobile-only').click();
    await page.locator('.person').click();
    await dialog.getByRole('button', { name: /^Sign out/ }).click();
    await dialog.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.app-layout')).toHaveCount(0);
    await signIn();
    await page.goto('/whey');
    await expect(page.getByRole('button', { name: lot.code, exact: true })).toBeVisible();
    const trialCard = adminPage.locator('.registration-review article').filter({ hasText: workspace });
    await expect(trialCard).toBeVisible();
    await trialCard
      .getByLabel('Reason / justification', { exact: true })
      .fill('Organization verified for full service');
    await trialCard.getByRole('button', { name: 'Approve full service' }).click();
    await expect
      .poll(async () => {
        const reply = await service.from('cooperative').select('service_plan').eq('id', cooperative).single();
        return reply.data?.service_plan;
      })
      .toBe('full');
  } finally {
    await resetMfa('admin1');
    await adminContext.close();
  }
});
