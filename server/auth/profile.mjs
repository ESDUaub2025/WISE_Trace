// What a signed-in person is in the business data: their membership, and the PIN unlock that
// prepares a phone for them. All checks run in the database as that person (row-level security applies).
import { AuthError } from './errors.mjs';
import { pinPattern } from './policy.mjs';

/** The person's membership, or where their self-registration stands when they have none yet. */
export async function readProfile(database, identity) {
  const [member] = await database.query(identity, {
    table: 'membership',
    filters: [{ column: 'user_id', op: 'eq', value: identity.id }],
  });
  if (member) return { profile: { ...member, id: member.user_id }, registration: null };
  const [request] = await database.query(identity, {
    table: 'registration_request',
    columns: 'status,review_reason',
    filters: [{ column: 'user_id', op: 'eq', value: identity.id }],
  });
  return { profile: null, registration: request ?? { status: 'none' } };
}

/**
 * Checks the PIN and prepares this phone for the person:
 * 1. registers the phone with their cooperative (refused when the phone was revoked),
 * 2. verifies the PIN in the database, which also counts wrong tries (5 tries, then a 15-minute pause),
 * 3. for people who may decide on whey offline, issues the credential that signs those decisions.
 */
export async function unlockProfile(database, identity, { pin, deviceId, deviceLabel }) {
  if (!pinPattern.test(String(pin ?? ''))) throw new AuthError('pinFailed', 401);
  const { profile, registration } = await readProfile(database, identity);
  if (!profile)
    throw new AuthError(registration.status === 'none' ? 'finishRegistration' : 'registrationPending', 409, {
      registration,
    });

  try {
    await database.rpc(identity, 'register_device', {
      target: deviceId,
      label: String(deviceLabel ?? 'Phone').slice(0, 120),
    });
  } catch (error) {
    if (/revoked|another cooperative/i.test(error.message)) throw new AuthError('deviceRevoked', 403);
    throw error;
  }

  const signoff = await database.rpc(identity, 'pin_signoff', {
    pin,
    device: deviceId,
    action: 'cache_session',
    object_id: identity.id,
  });
  if (!signoff) throw new AuthError('pinFailed', 401);

  const mayDecideOffline =
    profile.roles.includes('supervisor') ||
    (profile.roles.includes('producer') && profile.authorizations?.receive_whey);
  let offlineCredential = null;
  if (mayDecideOffline) {
    // Optional: without it the person still works; offline whey decisions then wait for a connection.
    offlineCredential = await database
      .rpc(identity, 'issue_offline_credential', { device: deviceId, sign: signoff })
      .catch(() => null);
  }
  return { profile, offline_credential: offlineCredential };
}
