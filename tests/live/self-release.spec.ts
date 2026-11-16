import { test, expect } from '@playwright/test';
import { actor, config, coop, login, packedBatch, rpc, send, serviceClient } from './fixtures';

test('A4 a producer with QA role cannot self-release unless original SOP allows it and flags remote review', async ({
  page,
}) => {
  const service = serviceClient();
  const username = 'solo_' + crypto.randomUUID().slice(0, 8);
  const user = await service.createAccount(username, 'wise-demo-only');
  await rpc(service, 'provision_membership', {
    target: user,
    coop,
    username,
    display_name: 'Fictional solo acceptance user',
    roles: ['producer', 'supervisor'],
    authorizations: { receive_whey: true, test_data: true },
    pin: '2468',
    actor: '20000000-0000-4000-8000-000000000004',
  });
  const configurations: string[] = [];
  let cleanupFailed = false;
  try {
    const source = (await service.from('config_version').select('definition').eq('id', config).single()).data!
      .definition;
    const intro = (
      await service
        .from('training_module')
        .select('*')
        .eq('config_version_id', config)
        .eq('module_key', 'gmp')
        .order('version', { ascending: false })
        .limit(1)
        .single()
    ).data!;
    const versions = await service
      .from('config_version')
      .select('version')
      .is('cooperative_id', null)
      .eq('kind', 'sop')
      .order('version', { ascending: false })
      .limit(1);
    let version = Number(versions.data![0].version);
    const batches: Awaited<ReturnType<typeof packedBatch>>[] = [];
    for (const selfRelease of [false, true]) {
      const configuration = crypto.randomUUID(),
        module = crypto.randomUUID();
      configurations.push(configuration);
      // Fictional fixture SOPs are retired after the scenario.
      const cv = await service.from('config_version').insert({
        id: configuration,
        kind: 'sop',
        version: ++version,
        status: 'approved',
        placeholder: true,
        effective_at: new Date(Date.now() - 60000).toISOString(),
        definition: { ...source, self_release: selfRelease },
        drafted_by: '20000000-0000-4000-8000-000000000004',
        approved_by: '20000000-0000-4000-8000-000000000005',
      });
      if (cv.error) throw cv.error;
      const tm = await service.from('training_module').insert({
        id: module,
        config_version_id: configuration,
        module_key: 'selfrelease_' + module,
        version: 1,
        required: true,
        content: intro.content,
        assessment: intro.assessment,
        effective_at: new Date(Date.now() - 60000).toISOString(),
      });
      if (tm.error) throw tm.error;
      const a = { ...(await actor(username)), configuration };
      await send(a, 'training', { module_id: module, answers: { hygiene: 'safe' } });
      batches.push(await packedBatch(username, configuration));
    }
    const blocked = batches[0];
    await login(page, username);
    await page.goto('/batches');
    await page.getByRole('button', { name: blocked.code, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Release batch', exact: true })).toBeDisabled();
    await expect(
      page.getByText('Another qualified person must release a batch you produced.', { exact: true }),
    ).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    const allowed = batches[1];
    await page.reload();
    await page.getByRole('button', { name: allowed.code, exact: true }).click();
    await page.getByRole('button', { name: 'Release batch', exact: true }).click();
    await page.getByLabel('Reason / justification', { exact: true }).fill('Configured single-person exception');
    await page.getByLabel('Personal PIN', { exact: true }).fill('2468');
    await page.getByRole('button', { name: 'Save record', exact: true }).click();
    await expect
      .poll(async () => {
        const row = await allowed.a.c.from('lot').select('state,wise_review').eq('id', allowed.id).single();
        return row.data;
      })
      .toEqual({ state: 'released', wise_review: true });
    await page.getByRole('button', { name: allowed.code, exact: true }).click();
    await expect(
      page.getByText('Self-release exception used. This batch is flagged for WISE remote review.', { exact: true }),
    ).toBeVisible();
  } finally {
    if (configurations.length) {
      const retired = await service.from('config_version').update({ status: 'retired' }).in('id', configurations);
      cleanupFailed = !!retired.error;
    }
    const result = await service.from('membership').update({ status: 'disabled' }).eq('user_id', user);
    cleanupFailed = cleanupFailed || !!result.error;
  }
  expect(cleanupFailed).toBe(false);
});
