import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const endpoint = 'https://script.google.com/macros/s/wise-test-stub/exec';
const mode = 'username-only-v2';
type RecordEntry = { id: string; value: unknown; createdBy: string; updatedBy: string };

function service(legacy = false) {
  let version = 0,
    generation = 1;
  let records: RecordEntry[] = [];
  let users: { username: string }[] = [];
  const epoch = () => 'workspace-' + generation;
  async function connect(context: BrowserContext) {
    await context.addInitScript(() => localStorage.setItem('wise-language', 'en'));
    await context.route(endpoint, async (route) => {
      const request = route.request();
      let reply: unknown = { ok: true, ready: true, mode: legacy ? undefined : mode };
      if (request.method() === 'POST') {
        const input = request.postDataJSON();
        if (legacy) reply = { ok: false, error: 'invalid_credentials' };
        else if (input.action === 'login') {
          if (!users.some((user) => user.username === input.username)) {
            users.push({ username: input.username });
            version++;
          }
          reply = { ok: true, mode, epoch: epoch(), user: { username: input.username, canWrite: true } };
        } else if (input.epoch !== epoch()) reply = { ok: false, error: 'workspace_reset' };
        else if (input.action === 'read') reply = { ok: true, data: { epoch: epoch(), version, records, users } };
        else if (input.version !== version) reply = { ok: false, error: 'conflict_reload' };
        else {
          records.push({ id: input.id, value: input.value, createdBy: input.username, updatedBy: input.username });
          reply = { ok: true, version: ++version };
        }
      }
      await route.fulfill({ json: reply });
    });
  }
  return {
    connect,
    records: () => records,
    users: () => users,
    reset() {
      generation++;
      version = 0;
      records = [];
      users = [];
    },
  };
}

async function signIn(page: Page, username: string, path = '#/today') {
  await page.goto('/wise-trace-test/' + path);
  await expect(page.getByRole('heading', { name: 'WISE testing workspace' })).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByRole('button', { name: 'Start testing', exact: true }).click();
  await expect(page.locator('.w-nav')).toBeVisible();
}

async function addSupplier(page: Page) {
  await page.goto('/wise-trace-test/#/prepare?section=supplier');
  await page.getByLabel('Supplier name', { exact: true }).fill('Valley Dairy');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saved', exact: true })).toBeVisible();
}

async function receive(page: Page, navigate = true) {
  if (navigate) await page.goto('/wise-trace-test/#/task/receive/');
  for (let i = 0; i < 20; i++) {
    const heading = page.locator('#s-step-title');
    const title = await heading.innerText();
    if (title === 'Record a test decision') return;
    if (title === 'How much whey?') await page.locator('.s-step input[type="number"]').fill('120');
    else if (title.includes('hours ago')) await page.locator('.s-step input[type="number"]').fill('2');
    else if (title === 'Pasteurized milk?') await page.getByRole('radio', { name: 'Yes', exact: true }).click();
    else if (title === 'Milk from') await page.getByRole('radio', { name: 'Cow', exact: true }).click();
    else if (title === 'How it came') await page.getByRole('radio', { name: 'Supplier vehicle', exact: true }).click();
    else if (title === 'Container') await page.getByRole('radio', { name: 'Food-grade drum', exact: true }).click();
    else if (title.includes('readings') || title.includes('Readings')) {
      await page.locator('.s-step input[type="number"]').nth(0).fill('5.2');
      await page.locator('.s-step input[type="number"]').nth(1).fill('6');
    }
    const button = page.locator('.s-step-foot .s-primary');
    await expect(button).toBeEnabled();
    await button.click();
    await expect(heading).not.toHaveText(title);
  }
  throw new Error('Receiving never reached the test decision');
}

async function accept(page: Page) {
  await page.getByRole('radio', { name: 'Accept for testing', exact: true }).check();
  await page.getByLabel('What did you decide, and why?').fill('Readings checked for this test delivery');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Test decision saved' })).toBeVisible();
}

test('live bookmarks open one worker view; new names share records and stay signed in', async ({
  page,
  context,
  browser,
}) => {
  const backend = service();
  await backend.connect(context);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page, 'alice', '#/batches');
  await expect(page.getByRole('heading', { name: 'My work', exact: true })).toBeVisible();
  await expect(page.locator('.w-nav button')).toHaveCount(3);
  await expect(page.getByText('Rima Haddad', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Organization', { exact: true })).toHaveCount(0);
  await addSupplier(page);
  await receive(page);
  await accept(page);
  await expect.poll(() => backend.records().length).toBe(3);
  await page.goto('/wise-trace-test/#/task/receive/');
  if ((await page.locator('#s-step-title').innerText()).includes('Same as usual'))
    await page.locator('.s-step-foot .s-primary').click();
  await expect(page.locator('.s-step input[type="number"]')).toHaveValue('');
  const second = await browser.newContext();
  try {
    await backend.connect(second);
    const other = await second.newPage();
    await signIn(other, 'bob', '#/work');
    await expect(other.locator('.w-lot-row')).toHaveCount(1);
    await expect(other.locator('.w-lot-row')).toContainText('Valley Dairy');
    await expect(other.locator('.w-lot-row')).not.toContainText('~WL');
  } finally {
    await second.close();
  }
  await page.goto('/wise-trace-test/#/work');
  await page.reload();
  await expect(page.locator('.w-lot-row')).toHaveCount(1);
  expect(backend.users().map((user) => user.username)).toEqual(['alice', 'bob']);
  expect(errors).toEqual([]);
});

test('a first supplier can be added inside receiving and returns to the same job', async ({ page, context }) => {
  const backend = service();
  await backend.connect(context);
  await signIn(page, 'alice', '#/task/receive/');
  await page.locator('.s-step-foot .s-primary').click();
  await page.getByLabel('Supplier name', { exact: true }).fill('Valley Dairy');
  await page.getByRole('button', { name: 'Save and return to the job' }).click();
  await expect(page).toHaveURL(/#\/task\/receive\//);
  await expect(page.getByRole('heading', { name: 'How much whey?' })).toBeVisible();
});

test('workspace reset removes old cached records and queued uploads', async ({ page, context }) => {
  const backend = service();
  await backend.connect(context);
  await signIn(page, 'alice');
  await addSupplier(page);
  backend.reset();
  await page.reload();
  await expect(page.getByText('Valley Dairy', { exact: true })).toHaveCount(0);
  await expect.poll(() => backend.records().length).toBe(0);
  await page.goto('/wise-trace-test/#/today');
  await expect(page.getByRole('heading', { name: 'Add your first supplier' })).toBeVisible();
  expect(backend.users().map((user) => user.username)).toEqual(['alice']);
});

test('receiving, batch checks, packaging, review and sale form a complete guided journey', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  const backend = service();
  await backend.connect(context);
  await signIn(page, 'alice');
  await addSupplier(page);
  await receive(page);
  await accept(page);
  await page.goto('/wise-trace-test/#/task/batch/');
  await expect(page.getByRole('heading', { name: 'How much whey goes in?' })).toBeVisible();
  await page.locator('.s-step input[type="number"]').fill('40');
  await page.locator('.s-step-foot .s-primary').click();
  // No bulgur or salt is recorded yet: the person is told, and may start without them.
  await expect(page.getByRole('heading', { name: 'Other ingredients' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add ingredients', exact: true })).toBeVisible();
  await page.locator('.s-step-foot .s-primary').click();
  await expect(page.getByRole('heading', { name: 'Kishk started' })).toBeVisible();
  const records = backend.records() as {
    value: { envelope: { action: string; id: string; payload: Record<string, unknown> } };
  }[];
  const batch = records.find((r) => r.value.envelope.action === 'batch')!.value.envelope;
  expect(batch.payload.allocations).toHaveLength(1);
  expect(records.filter((r) => r.value.envelope.action === 'allocation')).toHaveLength(0);
  await page.goto('/wise-trace-test/#/work/' + batch.id);
  await expect(page.getByText('40 kg', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'out/worker-revamp/batch-desktop.png', fullPage: true });
  await expect(page.locator('table')).toHaveCount(0);
  await page.getByRole('button', { name: 'Record a check', exact: true }).click();
  await page.getByRole('button', { name: 'Everything OK', exact: true }).click();
  await expect(page.locator('.s-done')).toBeVisible();
  for (let i = 0; i < 5; i++) {
    await page.goto('/wise-trace-test/#/work/' + batch.id);
    const check = page.getByRole('button', { name: 'Record a check', exact: true });
    if (await check.count()) {
      await check.click();
      await page.locator('.s-step input[type="number"]').fill('24.3');
      await page.locator('.s-step-foot .s-primary').click();
      await expect(page.locator('.s-done')).toBeVisible();
      await page.goto('/wise-trace-test/#/work/' + batch.id);
    }
    await page.getByRole('button', { name: 'Finish this step', exact: true }).click();
    await page.locator('.s-step-foot .s-primary').click();
    await expect(page.locator('.s-done')).toBeVisible();
  }
  await page.goto('/wise-trace-test/#/work/' + batch.id);
  await page.getByRole('button', { name: 'Pack kishk', exact: true }).click();
  await page.getByRole('button', { name: 'Add materials', exact: true }).click();
  await page.getByLabel('What is the material called?').fill('Empty kraft pouches');
  await page.getByLabel('Quantity', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Save and return to the job' }).click();
  for (let i = 0; i < 8; i++) {
    if (await page.locator('.s-done').count()) break;
    const title = await page.locator('#s-step-title').innerText();
    if (title === 'Pouch type') await page.getByRole('radio', { name: 'Kraft', exact: true }).click();
    if (title === 'Size of each pouch') await page.getByRole('radio', { name: '500 g', exact: true }).click();
    if (title === 'How many pouches?') await page.locator('input[type="number"]').fill('10');
    await page.locator('.s-step-foot .s-primary').click();
    await expect.poll(() => page.locator('#s-step-title').allTextContents()).not.toEqual([title]);
  }
  await expect(page.locator('.s-done')).toBeVisible();
  const packaging = (backend.records() as typeof records).find((r) => r.value.envelope.action === 'packaging')!.value
    .envelope;
  await page.goto('/wise-trace-test/#/review/' + packaging.id);
  await page.getByLabel('What did you decide, and why?').fill('Checked all sample records for testing');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Test decision saved' })).toBeVisible();
  await page.goto('/wise-trace-test/#/task/sell/' + packaging.id);
  for (let i = 0; i < 10; i++) {
    if (await page.locator('.s-done').count()) break;
    const title = await page.locator('#s-step-title').innerText();
    if (title === 'How many pouches sold?') await page.locator('input[type="number"]').fill('2');
    if (title === 'Price per pouch') await page.locator('input[type="number"]').fill('5');
    if (title === 'Currency') await page.getByRole('radio', { name: 'US dollars', exact: true }).click();
    await page.locator('.s-step-foot .s-primary').click();
    await expect.poll(() => page.locator('#s-step-title').allTextContents()).not.toEqual([title]);
  }
  await expect(page.locator('.s-done')).toBeVisible();
  await page.goto('/wise-trace-test/#/work/' + packaging.id);
  await expect(page.getByText('8 Pouches', { exact: true })).toBeVisible();
  await page.getByText('History', { exact: true }).click();
  await expect(page.locator('.w-timeline')).not.toContainText('undefined');
  await expect(page.locator('.w-timeline')).toContainText('10 USD');
  await page.screenshot({ path: 'out/worker-revamp/stock-history.png', fullPage: true });
});

test('mobile Arabic layout, plain history and account controls stay inside the worker app', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const backend = service();
  await backend.connect(context);
  await signIn(page, 'alice');
  await addSupplier(page);
  await receive(page);
  await accept(page);
  await page.goto('/wise-trace-test/#/work');
  await page.locator('.w-lot-row').first().click();
  await expect(page.locator('details').first()).not.toHaveAttribute('open');
  await page.getByText('History', { exact: true }).click();
  await expect(page.locator('.w-timeline')).toContainText('Readings checked');
  await expect(page.locator('.w-timeline')).not.toContainText('equipment_id');
  await page.getByRole('button', { name: 'Your account', exact: true }).click();
  await page.getByRole('button', { name: 'العربية', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('.w-nav button')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(
    await page
      .locator('.w-header button,.w-nav button,.w-test button')
      .evaluateAll((buttons) => buttons.every((button) => button.getBoundingClientRect().height >= 48)),
  ).toBe(true);
  await page.screenshot({ path: 'out/worker-revamp/arabic-mobile.png', fullPage: true });
});

test('offline receiving stays on the device and sends once when reconnected', async ({ page, context }) => {
  const backend = service();
  await backend.connect(context);
  await signIn(page, 'alice');
  await addSupplier(page);
  await page.goto('/wise-trace-test/#/task/receive/');
  await expect(page.locator('#s-step-title')).toBeVisible();
  await context.setOffline(true);
  await receive(page, false);
  await accept(page);
  expect(backend.records()).toHaveLength(1);
  await context.setOffline(false);
  await page.locator('.w-header .status-pill').click();
  await page.getByRole('button', { name: 'Send now', exact: true }).click();
  await expect.poll(() => backend.records().length).toBe(3);
});

test('a changed shared quantity produces a recoverable conflict instead of a partial batch', async ({
  page,
  context,
}) => {
  const backend = service();
  await backend.connect(context);
  await signIn(page, 'alice');
  await addSupplier(page);
  await receive(page);
  await accept(page);
  await page.goto('/wise-trace-test/#/task/batch/');
  await page.locator('input[type="number"]').fill('40');
  const entry = backend
    .records()
    .find((r) => (r.value as { envelope: { action: string } }).envelope.action === 'receipt')!;
  const envelope = (entry.value as { envelope: Record<string, unknown> }).envelope;
  const id = crypto.randomUUID();
  backend.records().push({
    id,
    createdBy: 'alice',
    updatedBy: 'alice',
    value: {
      kind: 'wise-action',
      envelope: {
        ...envelope,
        id,
        action: 'batch',
        payload: { allocations: [{ input_lot_id: entry.id, quantity: 100, unit: 'kg' }] },
      },
    },
  });
  await page.locator('.s-step-foot .s-primary').click();
  await page.locator('.s-step-foot .s-primary').click();
  await expect(page.locator('.s-error').first()).toHaveText('Allocation exceeds available stock.');
  await expect(page.locator('.s-done')).toHaveCount(0);
  expect(backend.records()).toHaveLength(4);
  // The refused record is removed at once: nothing is left to clean up, and the person corrects the amount here.
  await expect(page.locator('.w-conflict')).toHaveCount(0);
  await page.goBack();
  await page.locator('input[type="number"]').fill('20');
  await page.locator('.s-step-foot .s-primary').click();
  await page.locator('.s-step-foot .s-primary').click();
  await expect(page.getByRole('heading', { name: 'Kishk started' })).toBeVisible();
  expect(backend.records()).toHaveLength(5);
});

test('an older refused record never makes a later save look failed or get entered twice', async ({ page, context }) => {
  const backend = service();
  await backend.connect(context);
  await signIn(page, 'alice');
  await addSupplier(page);
  await receive(page);
  await accept(page);
  await page.goto('/wise-trace-test/#/task/batch/');
  await page.locator('input[type="number"]').fill('40');
  await page.locator('.s-step-foot .s-primary').click();
  await page.locator('.s-step-foot .s-primary').click();
  await expect(page.getByRole('heading', { name: 'Kishk started' })).toBeVisible();
  const batch = (backend.records() as { id: string; value: { envelope: { action: string } } }[]).find(
    (r) => r.value.envelope.action === 'batch',
  )!;
  // Finishing the step before its required check is refused with the reason for that step.
  await page.goto('/wise-trace-test/#/task/stage/' + batch.id);
  await page.locator('.s-step-foot .s-primary').click();
  await expect(page.locator('.s-error')).toHaveText('Record the required check for this step before moving on.');
  // The check recorded next is saved once and shown as saved.
  await page.goto('/wise-trace-test/#/task/check/' + batch.id + '/hygiene');
  await page.getByRole('button', { name: 'Everything OK', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check saved' })).toBeVisible();
  expect(
    (backend.records() as { value: { envelope: { action: string } } }[]).filter(
      (r) => r.value.envelope.action === 'checkpoint',
    ),
  ).toHaveLength(1);
});

test('wrong numbers are refused where they are typed, and Back returns one question', async ({ page, context }) => {
  const backend = service();
  await backend.connect(context);
  await signIn(page, 'alice');
  await addSupplier(page);
  await page.goto('/wise-trace-test/#/task/receive/');
  const number = page.locator('.s-step input[type="number"]');
  const next = page.locator('.s-step-foot .s-primary');
  await number.fill('0');
  await expect(page.locator('.s-error')).toHaveText('Enter an amount above zero.');
  await expect(next).toBeDisabled();
  await number.fill('120');
  await next.click();
  await expect(page.locator('#s-step-title')).toContainText('hours ago');
  await number.fill('-3');
  await expect(page.locator('.s-error')).toBeVisible();
  await expect(next).toBeDisabled();
  await number.fill('2');
  await next.click();
  await expect(page.getByRole('heading', { name: 'Pasteurized milk?' })).toBeVisible();
  await page.goBack();
  await expect(page.locator('#s-step-title')).toContainText('hours ago');
  await expect(number).toHaveValue('2');
  await page.reload();
  await expect(page.locator('#s-step-title')).toContainText('hours ago');
});

test('the app reopens without a connection and keeps unsent work', async ({ page, context }) => {
  const backend = service();
  await backend.connect(context);
  await signIn(page, 'alice');
  await addSupplier(page);
  await page.goto('/wise-trace-test/#/work');
  // The shared file cannot be reached (the page itself still loads from the device).
  await context.route(endpoint, (route) => route.abort());
  await page.reload();
  await expect(page.locator('.w-nav')).toBeVisible();
  await expect(page.getByLabel('Username', { exact: true })).toHaveCount(0);
});

test('leaving an unfinished task asks before dropping the answers', async ({ page, context }) => {
  const backend = service();
  await backend.connect(context);
  await signIn(page, 'alice');
  await addSupplier(page);
  await page.goto('/wise-trace-test/#/task/receive/');
  await page.locator('input[type="number"]').fill('40');
  await page.locator('.w-nav').getByRole('button', { name: 'My work', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Leave this job?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep working', exact: true }).click();
  await expect(page.locator('input[type="number"]')).toHaveValue('40');
  await page.reload();
  await expect(page.locator('input[type="number"]')).toHaveValue('40');
});

test('an old Google deployment gives an update message instead of asking for a key', async ({ page, context }) => {
  const backend = service(true);
  await backend.connect(context);
  await page.goto('/wise-trace-test/');
  await page.getByLabel('Username', { exact: true }).fill('alice');
  await page.getByRole('button', { name: 'Start testing', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Testing is being updated. Please try again shortly.');
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test('the hygiene list is ticked item by item, and a step explains itself without a dead button', async ({
  page,
  context,
}) => {
  const backend = service();
  await backend.connect(context);
  await signIn(page, 'alice');
  await addSupplier(page);
  await receive(page);
  await accept(page);
  await page.goto('/wise-trace-test/#/task/batch/');
  await page.locator('input[type="number"]').fill('40');
  await page.locator('.s-step-foot .s-primary').click();
  await page.locator('.s-step-foot .s-primary').click();
  await page.getByRole('button', { name: /Do the check/ }).click();
  const boxes = page.locator('.s-step input[type="checkbox"]');
  await expect(boxes).toHaveCount(6);
  await expect(page.locator('.s-step input[type="checkbox"]:checked')).toHaveCount(0);
  // Ticking only some items turns the save into a report of what was not OK.
  await boxes.nth(0).check();
  await expect(page.getByRole('button', { name: 'Save with problems', exact: true })).toBeVisible();
  for (let i = 1; i < 6; i++) await boxes.nth(i).check();
  await page.getByRole('button', { name: 'Everything OK', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check saved' })).toBeVisible();
  await page.getByRole('button', { name: /Move to the next step/ }).click();
  await expect(page.locator('.s-step')).toContainText('Clean and prepare the area');
  await expect(page.locator('.s-step')).toContainText('There is no timer');
  await page.locator('.s-step-foot .s-primary').click();
  await expect(page.getByRole('heading', { name: 'Now: Mixing' })).toBeVisible();
  await expect(page.locator('.s-done')).toContainText('Mix the whey with the bulgur and salt');
  // Mixing has only just started: nothing invites the person to skip it.
  await expect(page.getByRole('button', { name: /Move to the next step/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Home', exact: true })).toBeVisible();
});
