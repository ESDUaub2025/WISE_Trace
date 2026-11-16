import { resetMfa } from './client';
import { loginMfa } from './mfa';
import { test, expect } from '@playwright/test';
import QRCode from 'qrcode';
import { readFileSync } from 'node:fs';
import { client, login, rpc, config } from './fixtures';

test('real admin TOTP, private training upload, producer download and offline media', async ({ page, context }) => {
  test.setTimeout(90000);
  const admin = await loginMfa(page, 'admin1');
  try {
    await page.goto('/admin');
    const upload = page
      .locator('form')
      .filter({ has: page.getByRole('heading', { name: 'Training pictures and videos', exact: true }) });
    const title = 'Training-' + crypto.randomUUID();
    await upload.getByLabel('Title in English', { exact: true }).fill(title);
    await upload.getByLabel('Title in Arabic', { exact: true }).fill('صورة تدريبية');
    await upload.locator('input[type=file]').setInputFiles({
      name: 'guide.png',
      mimeType: 'image/png',
      buffer: await QRCode.toBuffer('Illustrated learning test'),
    });
    await upload.getByRole('button', { name: 'Upload training media', exact: true }).click();
    await expect
      .poll(async () => {
        const r = await admin.from('training_asset').select('id').eq('title->>en', title);
        return r.data?.length ?? 0;
      })
      .toBe(1);
    const asset = (await admin.from('training_asset').select('*').eq('title->>en', title).single()).data!;
    expect(asset.media_type).toBe('image/jpeg');
    expect(asset.byte_size).toBeLessThan(300 * 1024);
    const anonymous = await client().storage.from('training').download(asset.storage_path);
    expect(anonymous.error).toBeTruthy();
    const videoTitle = title + '-video';
    await upload.getByLabel('Title in English', { exact: true }).fill(videoTitle);
    await upload.getByLabel('Title in Arabic', { exact: true }).fill('فيديو تدريبي');
    await upload.locator('input[type=file]').setInputFiles({
      name: 'guide.mp4',
      mimeType: 'video/mp4',
      buffer: readFileSync(new URL('../fixtures/training.mp4', import.meta.url)),
    });
    await upload.getByRole('button', { name: 'Upload training media', exact: true }).click();
    await expect
      .poll(async () => {
        const r = await admin.from('training_asset').select('id').eq('title->>en', videoTitle);
        return r.data?.length ?? 0;
      })
      .toBe(1);
    const video = (await admin.from('training_asset').select('*').eq('title->>en', videoTitle).single()).data!;
    expect(video.media_type).toMatch(/^video\//);
    expect(video.byte_size).toBeLessThan(10 * 1024 * 1024);
    const module = await rpc(admin, 'publish_training', {
      module_key: 'media_' + crypto.randomUUID(),
      config,
      required: false,
      effective: new Date(Date.now() + 2000).toISOString(),
      content: {
        en: 'Download this illustrated guide for offline learning.',
        ar: 'نزّل هذا الدليل المصوّر للتعلم والاستخدام دون اتصال.',
        title: { en: title, ar: 'دليل مصوّر' },
        resources: [asset.id, video.id],
      },
      assessment: [
        {
          key: 'ready',
          question: { en: 'Ready to continue?', ar: 'هل أنت جاهز للمتابعة؟' },
          correct: 'yes',
          options: [
            { key: 'yes', label: { en: 'Yes', ar: 'نعم' } },
            { key: 'no', label: { en: 'No', ar: 'لا' } },
          ],
        },
      ],
    });
    const producer = await context.newPage();
    await login(producer);
    await producer.goto('/training');
    const card = producer.locator(`#module-${module}`);
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Download module for offline use', exact: true }).click();
    await expect(card.getByRole('button', { name: /Downloaded/ })).toHaveCount(2);
    await expect(card.locator('img')).toHaveAttribute('src', /^blob:/);
    await context.setOffline(true);
    await producer.reload();
    await expect(card.locator('img')).toHaveAttribute('src', /^blob:/);
    await expect(card.locator('video')).toHaveAttribute('src', /^blob:/);
    expect(await card.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(
      true,
    );
    await context.setOffline(false);
    await producer.close();
  } finally {
    await context.setOffline(false);
    await resetMfa('admin1');
  }
});
