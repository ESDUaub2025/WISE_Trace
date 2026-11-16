import { test, expect, type Page } from '@playwright/test';
import { actor } from './fixtures';
import { chooseEnglish, enterPassword, enterPin } from './sign-in';

test.describe.configure({ mode: 'serial' });

async function signIn(page: Page, username = 'rima', query = '') {
  await chooseEnglish(page);
  await page.goto('/today' + query);
  await enterPassword(page, username);
  await enterPin(page);
  // Supervisors start in the full workspace; these tests are about the simple one.
  await page.locator('.s-app, .app-layout').first().waitFor();
  if (!(await page.locator('.s-app').count())) await page.goto('/today' + query);
  await expect(page.getByText(/^Good (morning|afternoon|evening), /)).toBeVisible({ timeout: 30000 });
}
const title = (page: Page) => page.locator('h1, .s-bubble strong#s-step-title').last();
/** The procedure's two readings, in screen order: pH, then temperature. */
async function readings(page: Page, ph: string, temperature: string) {
  const boxes = page.getByRole('spinbutton');
  await boxes.nth(0).fill(ph);
  await boxes.nth(1).fill(temperature);
}
async function fromMore(page: Page, action: string) {
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: action }).click();
}

/** Answers each receiving screen the way a producer would: confirm the usual, pick the first option when nothing is chosen, type readings. */
async function receiveWhey(page: Page, ph = '5.2', temperature = '6') {
  for (let i = 0; i < 15; i++) {
    if (await page.getByText(/^(The whey looks good|Something is off with this whey)$/).count()) return;
    const heading = (await title(page).innerText()).trim();
    if (heading === 'Who brought the whey?') {
      await page.getByRole('radio', { name: /Cedar Dairy/ }).click();
      continue;
    }
    if (heading === "Today's readings") {
      await readings(page, ph, temperature);
    } else if (heading === 'How much whey?') await page.getByRole('spinbutton').fill('60');
    else if (
      (await page.getByRole('radiogroup').count()) === 1 &&
      !(await page.locator('[role=radio][aria-checked=true]').count())
    ) {
      await page.getByRole('radio').first().click();
      await page.waitForTimeout(400);
      continue;
    }
    await page
      .getByRole('button', { name: /^(Next|Save|Yes, same as usual)$/ })
      .last()
      .click();
    // Saving syncs before the decision opens, so wait for the screen to move on.
    await expect(title(page)).not.toHaveText(heading, { timeout: 30000 });
  }
}

test('An experienced producer receives whey, accepts it, starts kishk and records the hygiene check, each job leading to the next', async ({
  page,
}) => {
  await signIn(page);
  await fromMore(page, 'Whey arrived');
  await receiveWhey(page);
  await expect(page.getByText('All readings are within limits and checks are normal.')).toBeVisible({ timeout: 30000 });
  const name = (await page.locator('.s-meta').first().innerText()).split(' · ').slice(0, 3).join(' · ');
  await page.getByLabel('Your PIN to sign').fill('2468');
  await page.getByRole('button', { name: 'Looks good. Accept it' }).click();
  await expect(page.getByRole('heading', { name: 'Whey accepted' })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Next: Start making kishk' }).click();
  await expect(
    page.getByRole('radio', { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }),
  ).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Start making kishk', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Kishk started' })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Next: Do the check' }).click();
  await expect(page.getByRole('heading', { name: 'Pre-production hygiene' })).toBeVisible();
  await page.getByRole('button', { name: 'Everything OK' }).click();
  await expect(page.getByRole('heading', { name: 'Check saved' })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('button', { name: 'Next: Move to the next step' })).toBeVisible();

  // The server holds the same records the full app would have written.
  const { c } = await actor('rima');
  const { data: wheys } = await c
    .from('lot')
    .select('*')
    .eq('type', 'whey')
    .order('observed_at', { ascending: false })
    .limit(1);
  const whey = wheys[0];
  expect(whey).toMatchObject({ state: 'accepted' });
  expect(whey.facts).toMatchObject({ ph: 5.2, reception_temperature: 6, declarations_confirmed: true });
  expect(whey.facts.measurements).toHaveLength(2);
  const { data: uses } = await c.from('consumption').select('*').eq('input_lot_id', whey.id);
  expect(uses).toHaveLength(1);
  const { data: records } = await c.from('operational_record').select('*').eq('lot_id', uses[0].output_lot_id);
  expect(records.map((r: { definition_key: string }) => r.definition_key)).toEqual(['hygiene']);
});

test('The second delivery from a supplier offers the first delivery\'s answers on one "same as usual" card', async ({
  page,
}) => {
  await signIn(page);
  await fromMore(page, 'Whey arrived');
  if (await page.getByRole('radio', { name: /Cedar Dairy/ }).count())
    await page.getByRole('radio', { name: /Cedar Dairy/ }).click();
  await expect(page.getByRole('heading', { name: 'Same as usual from Cedar Dairy?' })).toBeVisible();
  for (const question of ['How much whey?', 'Pasteurized milk?', 'How it came', 'Container'])
    await expect(page.locator('.s-usual')).toContainText(question);
  await page.getByRole('button', { name: 'Yes, same as usual' }).click();
  const remaining: string[] = [];
  for (let i = 0; i < 6; i++) {
    const heading = (await title(page).innerText()).trim();
    remaining.push(heading);
    if (await page.getByRole('button', { name: 'Save', exact: true }).count()) break;
    if (heading === "Today's readings") {
      await readings(page, '5', '5');
    }
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  // Fresh checks are never pre-confirmed: readings are still asked.
  expect(remaining).toContain("Today's readings");
  expect(remaining).not.toContain('How it came');
});

test('Out-of-range whey can only be sent to a supervisor in signal mode', async ({ page }) => {
  await signIn(page);
  await fromMore(page, 'Whey arrived');
  await receiveWhey(page, '6.8', '5');
  await expect(page.getByText('Something is off with this whey')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('pH 6.8')).toBeVisible();
  await expect(page.getByRole('button', { name: /Accept/ })).toHaveCount(0);
  await page.getByLabel('Your PIN to sign').fill('2468');
  await page.getByRole('button', { name: 'Send to a supervisor' }).click();
  await expect(page.getByRole('heading', { name: 'Whey set aside' })).toBeVisible({ timeout: 30000 });
});

test('The chat style runs the same steps as a conversation', async ({ page }) => {
  await signIn(page, 'rima', '?style=chat');
  await expect(page.locator('.s-chat-home .s-from-app').first()).toBeVisible();
  await page.getByRole('button', { name: 'What else?' }).click();
  await expect(page.locator('.s-from-me')).toHaveText('What else?');
  await page.locator('.s-chat-replies').getByRole('button', { name: 'Whey arrived' }).click();
  if (await page.getByRole('radio', { name: /Cedar Dairy/ }).count())
    await page.getByRole('radio', { name: /Cedar Dairy/ }).click();
  await page.getByRole('button', { name: 'Yes, same as usual' }).click();
  // The confirmed card becomes the person's reply in the conversation.
  await expect(page.locator('.s-from-me').filter({ hasText: 'Yes, same as usual' })).toBeVisible();
});

test('With one chosen recorder, other producers get no recording buttons', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('button', { name: 'Try a different setup' }).click();
  await page.getByRole('radio', { name: 'Chosen people only' }).click();
  await page.getByLabel('Karim Nassar').check();
  await page.getByRole('button', { name: 'Use on this device' }).click();
  await expect(page.getByText('On this cooperative, Karim Nassar records production.')).toBeVisible();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Whey arrived' })).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Try a different setup' }).click();
  await page.getByRole('button', { name: 'Back to file defaults' }).click();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Whey arrived' })).toBeVisible();
});
