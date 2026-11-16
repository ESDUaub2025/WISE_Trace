import { it, expect, vi } from 'vitest';
import { db } from '../offline/db';
import { demoIdentity } from '../lib/demo';
const calls = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../lib/api', () => ({ demo: false, api: { rpc: calls.rpc } }));
vi.mock('./push-settings', () => ({ PushSettings: () => null }));
import { flushNotificationReads } from './notifications';
it('keeps failed reads queued, processes later valid reads and isolates other users', async () => {
  vi.stubGlobal('navigator', { onLine: true });
  const own = `notification-read:${demoIdentity.id}:`,
    other = 'notification-read:another-user:valid';
  await db.cache.bulkPut([
    { key: own + 'a-invalid', value: 'now' },
    { key: own + 'b-valid', value: 'now' },
    { key: other, value: 'now' },
  ]);
  calls.rpc.mockImplementation(async (_name, args) => ({
    error: args.target === 'a-invalid' ? new Error('invalid') : null,
  }));
  await expect(flushNotificationReads(demoIdentity)).rejects.toThrow('invalid');
  expect(calls.rpc).toHaveBeenCalledTimes(2);
  expect(await db.cache.get(own + 'a-invalid')).toBeDefined();
  expect(await db.cache.get(own + 'b-valid')).toBeUndefined();
  expect(await db.cache.get(other)).toBeDefined();
  await db.cache.bulkDelete([own + 'a-invalid', other]);
  vi.unstubAllGlobals();
});
