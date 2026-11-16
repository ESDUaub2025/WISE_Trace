// The people this device remembers, kept in the browser's own database so they can unlock without a connection.
// A profile holds no password and no PIN: only a slow, salted PIN check value (src/session/pin.ts).
// Unsent records are stored elsewhere (src/offline/db.ts) and are never removed from here.
import { db } from '../offline/db';
import type { Identity } from '../lib/domain';
import type { OfflineCredential } from './sealed-ticket';

export interface DeviceProfile {
  identity: Identity;
  /** Lets the PIN be checked on this device when the server cannot be reached. */
  verifier: { salt: number[]; hash: string };
  /** When the server last confirmed this person's PIN here. The offline allowance counts from this moment. */
  confirmedAt: number;
  assurance: 'aal1' | 'aal2';
  /** Signs whey decisions made without a connection; sealed with the PIN. Only for people allowed to decide. */
  offlineCredential?: OfflineCredential;
  /** Set when the server said this person's access changed; they must sign in online again. */
  blocked?: string;
}

const profileKey = (id: string) => `profile:${id}`;
const activeKey = 'active-person';
const attemptsKey = (id: string) => `pin-attempts:${id}`;

export async function listProfiles(): Promise<DeviceProfile[]> {
  const rows = await db.cache.where('key').startsWith('profile:').toArray();
  return rows
    .map((row) => row.value as DeviceProfile)
    .filter((profile) => profile?.identity?.id)
    .sort((a, b) => a.identity.display_name.localeCompare(b.identity.display_name));
}

export async function getProfile(id: string): Promise<DeviceProfile | undefined> {
  return (await db.cache.get(profileKey(id)))?.value as DeviceProfile | undefined;
}

export async function saveProfile(profile: DeviceProfile) {
  await db.cache.put({ key: profileKey(profile.identity.id), value: profile });
}

/** Forgets a person on this device. Their unsent records stay queued and send when they sign in again. */
export async function removeProfile(id: string) {
  await db.transaction('rw', db.cache, async () => {
    const training = await db.cache.where('key').startsWith(`training:${id}:`).primaryKeys();
    await db.cache.bulkDelete([profileKey(id), attemptsKey(id), `snapshot:${id}`, `replica:${id}`, ...training]);
    if ((await getActiveId()) === id) await db.cache.delete(activeKey);
  });
}

/** Marks a person as needing a fresh online sign-in (access changed or account disabled). */
export async function blockProfile(id: string, reason: string) {
  const profile = await getProfile(id);
  if (profile) await saveProfile({ ...profile, blocked: reason });
  if ((await getActiveId()) === id) await db.cache.delete(activeKey);
}

export async function getActiveId(): Promise<string | undefined> {
  return (await db.cache.get(activeKey))?.value as string | undefined;
}

export async function setActiveId(id: string | null) {
  if (id) await db.cache.put({ key: activeKey, value: id });
  else await db.cache.delete(activeKey);
}

export interface PinAttempts {
  failures: number;
  pausedUntil: number;
}

export async function getPinAttempts(id: string): Promise<PinAttempts> {
  return ((await db.cache.get(attemptsKey(id)))?.value as PinAttempts | undefined) ?? { failures: 0, pausedUntil: 0 };
}

export async function setPinAttempts(id: string, attempts: PinAttempts | null) {
  if (attempts) await db.cache.put({ key: attemptsKey(id), value: attempts });
  else await db.cache.delete(attemptsKey(id));
}

/**
 * Removes sign-in data written by earlier versions of the app (2026-11 sign-in rebuild).
 * Those entries cannot be used with the new server and would only confuse the person chooser.
 */
export async function forgetLegacySessions() {
  const stale = await db.cache
    .where('key')
    .startsWith('session:')
    .or('key')
    .startsWith('access-blocked:')
    .or('key')
    .equals('identity')
    .primaryKeys();
  if (stale.length) await db.cache.bulkDelete(stale);
}
