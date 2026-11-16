import { enterPin, syncNow } from './sign-in';
import { test, expect } from '@playwright/test';
import { login, actor, send, serviceClient } from './fixtures';
test('incremental refresh transfers changed rows without downloading history and persists them offline', async ({
  page,
  context,
}) => {
  await login(page);
  await page.goto('/whey');
  const a = await actor(),
    id = await send(a, 'receipt', {
      type: 'whey',
      supplier_id: '50000000-0000-4000-8000-000000000001',
      quantity: 3,
      unit: 'kg',
      generation_at: new Date(Date.now() - 3600000).toISOString(),
      facts: { ph: 5, reception_temperature: 5 },
    });
  const row = await a.c.from('lot').select('code').eq('id', id).single();
  const code = String(row.data!.code);
  const requests: string[] = [];
  page.on('request', (request) =>
    requests.push(
      request.url().endsWith('/rpc/snapshot_bootstrap') ? request.postDataJSON().table_name : request.url(),
    ),
  );
  const delta = page.waitForResponse((response) => response.url().includes('/rpc/snapshot_changes'));
  await syncNow(page);
  await delta;
  await expect(page.getByRole('button', { name: code, exact: true })).toBeVisible();
  expect(requests.some((url) => /\/rest\/v1\/(lot|operational_record|audit_event)\?/.test(url))).toBe(false);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: code, exact: true })).toBeVisible();
});
test('failed balance refresh preserves its dirty lot IDs until recovery', async ({ page }) => {
  await login(page);
  await page.goto('/whey');
  await page.route('**/api/rpc/snapshot_balances', (route) => route.abort());
  const a = await actor(),
    id = await send(a, 'receipt', {
      type: 'whey',
      supplier_id: '50000000-0000-4000-8000-000000000001',
      quantity: 3,
      unit: 'kg',
      generation_at: new Date(Date.now() - 3600000).toISOString(),
      facts: { ph: 5, reception_temperature: 5 },
    });
  const row = await a.c.from('lot').select('code').eq('id', id).single(),
    code = String(row.data!.code);
  const failed = page.waitForRequest((request) => request.url().includes('/rpc/snapshot_balances'));
  await syncNow(page);
  await failed;
  await page.unroute('**/api/rpc/snapshot_balances');
  await page.reload();
  await expect(page.getByRole('button', { name: code, exact: true })).toBeVisible();
  await page.getByRole('button', { name: code, exact: true }).click();
  await expect(page.locator('.material-balance')).toContainText('Received');
  await expect(page.locator('.material-balance dd').first()).toHaveText('3 kg');
  await expect(page.locator('.material-balance dd').nth(9)).toHaveText('3 kg');
});
test('known account disablement blocks cached PIN access and retains pending authorship for review', async ({
  page,
  context,
}) => {
  const admin = serviceClient(),
    user = '20000000-0000-4000-8000-000000000001';
  try {
    await login(page);
    await page.goto('/batches');
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Start a batch', exact: true }).click();
    await page.getByRole('button', { name: 'Save record', exact: true }).click();
    await expect(page.getByText('Saved on device', { exact: true })).toBeVisible();
    const id = await page.evaluate(async () => {
      const connection = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('wise-v1');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const rows = await new Promise<{ id: string; envelope: { action: string } }[]>((resolve, reject) => {
        const request = connection.transaction('outbox').objectStore('outbox').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      connection.close();
      return rows.find((row) => row.envelope.action === 'batch')!.id;
    });
    const changed = await admin.from('membership').update({ status: 'disabled' }).eq('user_id', user);
    expect(changed.error).toBeNull();
    await context.setOffline(false);
    // Reconnecting sends the waiting record; the server then reports the account as disabled and the app locks.
    await expect(page.getByRole('status').filter({ hasText: 'This account is disabled' })).toBeVisible({
      timeout: 20000,
    });
    const receipt = await admin.from('sync_receipt').select('author_id,status,error').eq('id', id).single();
    expect(receipt.error).toBeNull();
    expect(receipt.data).toMatchObject({ author_id: user, status: 'conflict' });
    expect(receipt.data!.error).toContain('Disabled account evidence retained for review');
    await context.setOffline(true);
    await page.reload();
    await page.locator('.acct-people button').first().click();
    await enterPin(page);
    await expect(page.getByRole('alert')).toContainText('This account is disabled');
  } finally {
    await context.setOffline(false);
    const restored = await admin.from('membership').update({ status: 'active' }).eq('user_id', user);
    expect(restored.error).toBeNull();
  }
});
test('interrupted initial snapshot resumes completed tables after reload', async ({ page }) => {
  await login(page);
  const user = await page.evaluate(async () => {
    const connection = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('wise-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = await new Promise<{ value: string }>((resolve, reject) => {
      const request = connection.transaction('cache').objectStore('cache').get('active-person');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = connection.transaction('cache', 'readwrite');
      transaction.objectStore('cache').delete('replica:' + row.value);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    connection.close();
    return row.value;
  });
  await page.route('**/api/rpc/snapshot_bootstrap', (route) =>
    route.request().postDataJSON().table_name === 'operational_record' ? route.abort() : route.continue(),
  );
  const interrupted = page.waitForRequest(
    (request) =>
      request.url().endsWith('/rpc/snapshot_bootstrap') && request.postDataJSON().table_name === 'operational_record',
  );
  await syncNow(page);
  await interrupted;
  await expect
    .poll(() =>
      page.evaluate(async (id) => {
        const connection = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('wise-v1');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const row = await new Promise<{ value: { bootstrap: { table: number }; rows: unknown[][] } }>(
          (resolve, reject) => {
            const request = connection
              .transaction('cache')
              .objectStore('cache')
              .get('replica:' + id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          },
        );
        connection.close();
        return row.value.bootstrap?.table;
      }, user),
    )
    .toBe(3);
  await page.unroute('**/api/rpc/snapshot_bootstrap');
  const requests: string[] = [];
  page.on('request', (request) =>
    requests.push(
      request.url().endsWith('/rpc/snapshot_bootstrap') ? request.postDataJSON().table_name : request.url(),
    ),
  );
  await page.reload();
  await expect(page.locator('.placeholder-banner')).toBeVisible();
  expect(requests.some((url) => ['lot', 'supplier', 'task'].includes(url))).toBe(false);
});
