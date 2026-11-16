import { resetMfa } from './client';
import { test, expect } from '@playwright/test';
import { loginMfa } from './mfa';
import { config } from './fixtures';

test('SOP file import creates a scoped draft and a separate MFA lead approves it with PIN', async ({
  page,
  browser,
}) => {
  const admin = await loginMfa(page, 'admin1');
  const leadContext = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' });
  const leadPage = await leadContext.newPage();
  let lead: Awaited<ReturnType<typeof loginMfa>> | undefined;
  try {
    const source = (await admin.from('config_version').select('definition').eq('id', config).single()).data!.definition;
    const title = 'Preparation CFG-' + crypto.randomUUID();
    source.stages[0].label.en = title;
    await page.goto('/admin');
    const form = page
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Create configuration draft', exact: true }) });
    await form.getByLabel('Import configuration into draft', { exact: true }).setInputFiles({
      name: 'sop.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          schema: 'wise.configuration.v1',
          kind: 'sop',
          status: 'approved',
          approved_by: 'forged',
          definition: source,
        }),
      ),
    });
    await form.getByLabel('Configuration scope', { exact: true }).selectOption('10000000-0000-4000-8000-000000000002');
    await form.locator('input[name=effective]').fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
    await form.getByRole('button', { name: 'Create configuration draft', exact: true }).click();
    await expect
      .poll(async () => {
        const result = await admin
          .from('config_version')
          .select('id')
          .eq('status', 'draft')
          .eq('cooperative_id', '10000000-0000-4000-8000-000000000002')
          .eq('definition->stages->0->label->>en', title);
        return result.data?.length ?? 0;
      })
      .toBe(1);
    const row = (
      await admin
        .from('config_version')
        .select('*')
        .eq('cooperative_id', '10000000-0000-4000-8000-000000000002')
        .eq('definition->stages->0->label->>en', title)
        .single()
    ).data!;
    expect(row.status).toBe('draft');
    expect(row.approved_by).toBeNull();
    lead = await loginMfa(leadPage, 'food_safety1');
    await leadPage.goto('/admin');
    leadPage.once('dialog', (dialog) => dialog.accept('2468'));
    await leadPage.getByRole('button', { name: 'Approve configuration · ' + row.version, exact: true }).click();
    await expect
      .poll(async () => {
        const result = await lead!.from('config_version').select('status').eq('id', row.id).single();
        return result.data?.status;
      })
      .toBe('approved');
    expect(
      (await lead.from('config_version').select('approved_by,drafted_by').eq('id', row.id).single()).data!.approved_by,
    ).not.toBe(row.drafted_by);
    expect(
      (await lead.from('lot').select('config_version_id').eq('id', '60000000-0000-4000-8000-000000000002').single())
        .data!.config_version_id,
    ).toBe(config);
  } finally {
    await resetMfa('admin1');
    if (lead) await resetMfa('food_safety1');
    await leadContext.close();
  }
});
