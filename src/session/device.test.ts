import { beforeEach, it, expect, vi } from 'vitest';
import { deviceLabel, getDevice, selectDevice } from './device';

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
});

it('gives people from different cooperatives their own device on one browser and switches back', async () => {
  const first = await selectDevice('coop-akkar');
  const second = await selectDevice('coop-test');
  expect(second).not.toBe(first);
  expect(await getDevice()).toBe(second);
  expect(await selectDevice('coop-akkar')).toBe(first);
  expect(await getDevice()).toBe(first);
});

it('survives a damaged device list by starting a new one', async () => {
  localStorage.setItem('wise-devices', '{not json');
  expect(await selectDevice('coop-akkar')).toMatch(/^[0-9a-f-]{36}$/);
});

it('labels the device with the person who registered it', () => {
  expect(deviceLabel('rima')).toMatch(/rima$/);
});
