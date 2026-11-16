// Unlocking without a connection: the rules a shared phone depends on when the server cannot check the PIN.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../connectivity/connectivity', () => ({
  isOnline: () => false,
  connectivity: { reportFailure: () => {}, reportReached: () => {} },
}));

import { db } from '../offline/db';
import type { Identity } from '../lib/domain';
import { sessionConfig } from '../config/session';
import { createPinVerifier } from './pin';
import { blockProfile, getActiveId, saveProfile } from './profiles';
import { lock, rememberedPeople, resume, unlockWithPin } from './session';
import { markActive } from './session-policy';

const rima: Identity = {
  id: '20000000-0000-4000-8000-000000000001',
  cooperative_id: 'coop',
  username: 'rima',
  display_name: 'Rima Haddad',
  roles: ['producer'],
  authorizations: {},
};
const day = 86_400_000;

async function remember(confirmedAt = Date.now()) {
  await saveProfile({ identity: rima, verifier: await createPinVerifier('2468'), confirmedAt, assurance: 'aal1' });
}

describe('offline unlock', () => {
  beforeEach(async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    });
    await db.cache.clear();
  });

  it('unlocks a remembered person with the right PIN and makes them the active person', async () => {
    await remember();
    expect((await unlockWithPin(rima, '2468')).username).toBe('rima');
    expect(await getActiveId()).toBe(rima.id);
    expect((await rememberedPeople()).map((person) => person.username)).toEqual(['rima']);
  });

  it('refuses someone this phone has never seen: the first sign-in needs the server', async () => {
    await expect(unlockWithPin(rima, '2468')).rejects.toThrow('onlineRequiredFirstTime');
  });

  it('pauses after the configured number of wrong PINs, even for the right PIN', async () => {
    await remember();
    for (let attempt = 0; attempt < sessionConfig.offlinePin.maxFailures; attempt += 1)
      await expect(unlockWithPin(rima, '0000')).rejects.toThrow('pinFailed');
    await expect(unlockWithPin(rima, '2468')).rejects.toThrow('pinLocked');
    expect(await getActiveId()).toBeUndefined();
  });

  it('stops working once the offline allowance has passed', async () => {
    await remember(Date.now() - (sessionConfig.defaults.offlineDays + 1) * day);
    await expect(unlockWithPin(rima, '2468')).rejects.toThrow('offlineTooLong');
  });

  it('refuses a person whose access the server withdrew', async () => {
    await remember();
    await blockProfile(rima.id, 'accountDisabled');
    await expect(unlockWithPin(rima, '2468')).rejects.toThrow('accountDisabled');
  });
});

describe('resuming and locking', () => {
  beforeEach(async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    });
    await db.cache.clear();
    await remember();
    await unlockWithPin(rima, '2468');
  });

  it('keeps the person active when the app is reopened within the lock window', async () => {
    expect((await resume()).identity?.id).toBe(rima.id);
  });

  it('asks for the PIN again after the inactivity limit, offering the same person first', async () => {
    markActive(rima.id, Date.now() - (sessionConfig.defaults.lockAfterMinutes + 1) * 60_000);
    const resumed = await resume();
    expect(resumed.identity).toBeNull();
    expect(resumed.locked?.id).toBe(rima.id);
  });

  it('locking keeps the person remembered', async () => {
    await lock();
    expect((await resume()).identity).toBeNull();
    expect(await rememberedPeople()).toHaveLength(1);
  });
});
