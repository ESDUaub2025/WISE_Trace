// Signing in, unlocking, locking and signing out on this device. No React here; the screens are in src/account.
//
// How the three secrets are used (docs/AUTH.md has the reasoning):
//   password            once per device, until the server-side sign-in expires
//   PIN                 every time a person picks their name; works offline for a limited number of days
//   authenticator code  administrators and Food-Safety Leads, with the password
//
// A step function returns the next thing to ask for, so the screens never decide the order themselves.
import { demo, setActingUser } from '../lib/api';
import { demoIdentity } from '../lib/demo';
import { clearFileSession, fileEpoch, fileTesting, resumeFileSession, signInToFile } from '../testing/file-backend';
import type { Identity } from '../lib/domain';
import { isOnline } from '../connectivity/connectivity';
import { sessionConfig } from '../config/session';
import { db, revokeLocalDevice } from '../offline/db';
import { deviceLabel, selectDevice } from './device';
import { createPinVerifier, verifyPin } from './pin';
import { sealSecret } from './sealed-ticket';
import { isApiError, sessionApi, type RegistrationState, type ServerLogin } from './session-api';
import { inactive, lastActivity, limitsFor, markActive, offlineExpired } from './session-policy';
import {
  forgetLegacySessions,
  getActiveId,
  getPinAttempts,
  getProfile,
  listProfiles,
  removeProfile,
  saveProfile,
  setActiveId,
  setPinAttempts,
  type DeviceProfile,
} from './profiles';

/** A failure the screens show as a translated message (src/i18n: the code is the key). */
export class SessionError extends Error {
  constructor(
    code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = 'SessionError';
  }
}

export type SignInStep =
  /** The person must enter an authenticator code; `setup` is present when they first have to add the authenticator. */
  | { step: 'second_factor'; user: string; setup?: { secret: string; uri: string } }
  /** Password accepted: the PIN finishes the sign-in. */
  | { step: 'pin'; user: string; identity: Identity }
  /** The account exists but has no workspace yet (self-registration). */
  | { step: 'registration'; user: string; registration: RegistrationState }
  | { step: 'done'; identity: Identity };

/** Server answers meaning "your sign-in on this device is no longer valid". */
const passwordAgain = ['sessionExpired', 'signInRequired', 'sessionChanged'];

async function nextStep(login: ServerLogin): Promise<SignInStep> {
  const user = login.user.id;
  if (login.status === 'second_factor_setup')
    return { step: 'second_factor', user, setup: await sessionApi.beginSecondFactor(user) };
  if (login.status === 'second_factor') return { step: 'second_factor', user };
  const { profile, registration } = await sessionApi.profile(user);
  if (!profile) return { step: 'registration', user, registration: registration ?? { status: 'none' } };
  return { step: 'pin', user, identity: profile };
}

/** Step 1 for a person this device does not know, or whose sign-in expired. */
export async function signInWithPassword(identifier: string, password: string): Promise<SignInStep> {
  if (fileTesting) {
    const identity = await signInToFile(identifier);
    await clearOldFileWorkspace();
    await activate(identity);
    return { step: 'done', identity };
  }
  return nextStep(await sessionApi.signIn(identifier.trim().toLowerCase(), password));
}

export async function submitSecondFactor(user: string, code: string): Promise<SignInStep> {
  return nextStep(await sessionApi.proveSecondFactor(user, code));
}

async function activate(identity: Identity) {
  await setActiveId(identity.id);
  markActive(identity.id);
  setActingUser(identity.id);
}

async function clearOldFileWorkspace() {
  const epoch = fileEpoch();
  if (!epoch || (await db.cache.get('file-workspace-epoch'))?.value === epoch) return;
  await db.transaction('rw', db.cache, db.outbox, db.media, async () => {
    await db.cache.clear();
    await db.outbox.clear();
    await db.media.clear();
    await db.cache.put({ key: 'file-workspace-epoch', value: epoch });
  });
}

/** The server checks the PIN, registers this device and returns the current profile. */
async function unlockOnline(identity: Identity, pin: string, assurance: 'aal1' | 'aal2'): Promise<Identity> {
  const device = identity.cooperative_id ? await selectDevice(identity.cooperative_id) : await selectDevice('none');
  const unlocked = await sessionApi.unlock(identity.id, pin, device, deviceLabel(identity.username));
  const profile: DeviceProfile = {
    identity: unlocked.profile,
    verifier: await createPinVerifier(pin),
    confirmedAt: Date.now(),
    assurance,
  };
  if (unlocked.offline_credential) {
    const { id, expires_at, secret } = unlocked.offline_credential;
    profile.offlineCredential = { id, expires_at, sealed: await sealSecret(secret, pin) };
  }
  await saveProfile(profile);
  await setPinAttempts(identity.id, null);
  await activate(unlocked.profile);
  return unlocked.profile;
}

/** No server: the PIN is checked against the value stored at the last online unlock. */
async function unlockOffline(profile: DeviceProfile, pin: string): Promise<Identity> {
  const id = profile.identity.id;
  if (profile.blocked) throw new SessionError(profile.blocked);
  if (offlineExpired(profile.confirmedAt, Date.now(), limitsFor(id))) throw new SessionError('offlineTooLong');
  const attempts = await getPinAttempts(id);
  if (attempts.pausedUntil > Date.now()) throw new SessionError('pinLocked');
  if (!(await verifyPin(pin, profile.verifier))) {
    const failures = (attempts.pausedUntil ? 0 : attempts.failures) + 1;
    const { maxFailures, pauseMinutes } = sessionConfig.offlinePin;
    await setPinAttempts(id, {
      failures,
      pausedUntil: failures >= maxFailures ? Date.now() + pauseMinutes * 60_000 : 0,
    });
    throw new SessionError('pinFailed');
  }
  await setPinAttempts(id, null);
  await activate(profile.identity);
  return profile.identity;
}

/**
 * Finishes a sign-in or unlocks a remembered person with their PIN.
 * Throws SessionError('passwordRequired') when the server no longer has a sign-in for them on this device.
 */
export async function unlockWithPin(identity: Identity, pin: string): Promise<Identity> {
  if (fileTesting) throw new SessionError('passwordRequired');
  if (demo) return demoIdentity;
  const remembered = await getProfile(identity.id);
  if (isOnline()) {
    try {
      const login = (await sessionApi.people()).find((person) => person.user.id === identity.id);
      if (!login) throw new SessionError('passwordRequired');
      if (login.disabled) throw new SessionError('accountDisabled');
      if (login.status !== 'ready') throw new SessionError('passwordRequired');
      return await unlockOnline(identity, pin, login.assurance);
    } catch (error) {
      if (!isApiError(error)) throw error;
      if (passwordAgain.includes(error.message) || error.message === 'secondFactorRequired')
        throw new SessionError('passwordRequired');
      if (error.message === 'deviceRevoked') {
        // Lost-device procedure (PRD FR-AUTH-07): a revoked device wipes its local data on its next connection.
        await revokeLocalDevice();
        throw new SessionError('deviceRevoked');
      }
      // The connection dropped mid-way: fall back to the device check below.
      if (!error.network) throw new SessionError(error.message, error.details);
    }
  }
  if (!remembered) throw new SessionError('onlineRequiredFirstTime');
  return unlockOffline(remembered, pin);
}

/** People who can unlock on this device with their PIN. */
export async function rememberedPeople(): Promise<Identity[]> {
  if (fileTesting) return [];
  if (demo) return [];
  return (await listProfiles()).map((profile) => profile.identity);
}

/**
 * At start-up: the person who was active, if the lock window has not passed.
 * `locked` names the person to offer first on the unlock screen otherwise.
 */
export async function resume(): Promise<{ identity: Identity | null; locked?: Identity }> {
  if (fileTesting) {
    const identity = await resumeFileSession();
    if (identity) {
      await clearOldFileWorkspace();
      await activate(identity);
    }
    return { identity };
  }
  if (demo) {
    return { identity: demoIdentity };
  }
  await forgetLegacySessions();
  const id = await getActiveId();
  const profile = id ? await getProfile(id) : undefined;
  if (!id || !profile || profile.blocked) return { identity: null };
  const limits = limitsFor(id);
  const idle = inactive(lastActivity(id) || profile.confirmedAt, Date.now(), limits);
  if (idle || offlineExpired(profile.confirmedAt, Date.now(), limits)) {
    await setActiveId(null);
    return { identity: null, locked: profile.identity };
  }
  setActingUser(id);
  return { identity: profile.identity };
}

/** Back to the unlock screen. The person stays remembered; nothing is erased. */
export async function lock() {
  if (fileTesting) clearFileSession();
  if (demo) return;
  await setActiveId(null);
  setActingUser(null);
}

/** Forgets a person on this device and ends their server sign-in here. Unsent records stay queued. */
export async function signOut(id: string) {
  if (fileTesting) {
    clearFileSession();
    await setActiveId(null);
    setActingUser(null);
    return;
  }
  if (demo) return;
  if (isOnline()) await sessionApi.signOut(id).catch(() => {});
  if ((await getActiveId()) === id) setActingUser(null);
  await removeProfile(id);
}

export async function changePassword(id: string, current: string, next: string) {
  await sessionApi.changePassword(id, current, next);
}
