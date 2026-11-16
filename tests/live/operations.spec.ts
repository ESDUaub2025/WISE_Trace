import { test, expect } from '@playwright/test';
import { login, packedBatch, release, rpc } from './fixtures';

test('impact product and status filters use the same cohort as exports', async ({ page }) => {
  await login(page, 'manager1');
  await page.goto('/dashboards');
  await page.getByLabel('Product', { exact: true }).selectOption('Whey kishk');
  await page.getByLabel('Status', { exact: true }).selectOption('draft');
  await expect(page.locator('.metric-card')).toHaveCount(13);
  await expect(page.locator('.metric-card').filter({ hasText: 'KPI-05' }).locator('strong')).toHaveText('0kg');
  await page.getByText('Consenting producer profiles', { exact: true }).click();
  await expect(page.getByText('Current consenting profiles', { exact: false })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /CSV.*CSV$/ }).click();
  await expect((await download).suggestedFilename()).toBe('wise-impact.csv');
});
test('manager switches between cooperative, project and impact dashboards', async ({ page }) => {
  await login(page, 'manager1');
  await page.goto('/dashboards');
  await page.getByRole('button', { name: 'Cooperative operations', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Monthly activity' })).toBeVisible();
  await expect(page.locator('.table-wrap')).toContainText('Akkar Harvest');
  await expect(page.locator('.table-wrap')).not.toContainText('Bekaa');
  await page.getByRole('button', { name: 'Project overview', exact: true }).click();
  await expect(page.locator('.stats-strip')).toContainText('Pending reviews');
  await page.getByRole('button', { name: 'Impact indicators', exact: true }).click();
  await expect(page.locator('.metric-card')).toHaveCount(13);
});
test('supervisor records recall actions and closes the case through a form', async ({ page }) => {
  const f = await packedBatch();
  const s = await release(f);
  const sign = await rpc(s.c, 'pin_signoff', { pin: '2468', device: s.device, action: 'recall', object_id: f.id });
  const reason = 'Case-' + crypto.randomUUID();
  const id = await rpc(s.c, 'start_recall', {
    target: f.id,
    mock: true,
    reason,
    notice: { en: 'Mock', ar: 'Mock' },
    sign,
  });
  await login(page, 'karim');
  await page.goto('/recall');
  await page.locator('.task-card').filter({ hasText: reason }).click();
  await page.getByLabel('Notes', { exact: true }).fill('Sale stopped during exercise');
  await page.getByRole('button', { name: 'Save record', exact: true }).click();
  await expect(page.getByRole('article').locator('.table-wrap')).toContainText('Sale stopped during exercise');
  await page.getByRole('button', { name: 'Close case', exact: true }).click();
  await expect
    .poll(async () => {
      const row = await s.c.from('recall').select('status').eq('id', id).single();
      return row.data?.status;
    })
    .toBe('closed');
});
