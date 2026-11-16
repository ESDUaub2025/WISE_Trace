// Account administration by people (PRD FR-ORG-02):
//   create        a WISE Admin creates anyone; a Cooperative Manager creates producers and supervisors of their own cooperative
//   reset_access  the same people give a member a new password and/or PIN (there is no email for most producers)
// WISE Admins must have proved their second factor in this sign-in.
import { authenticate, json } from '../_shared/http.mjs';
import { z } from 'zod';
import { authPolicy, pinPattern, usernamePattern } from '../../auth/policy.mjs';
import { AuthError } from '../../auth/errors.mjs';

const roles = z.enum(['producer', 'supervisor', 'manager', 'admin', 'food_safety', 'partner', 'donor']);
const password = z.string().min(authPolicy.password.minLength).max(authPolicy.password.maxLength);
const pin = z.string().regex(pinPattern);
const managerMayAssign = ['producer', 'supervisor'];

const createSchema = z.object({
  action: z.literal('create').default('create'),
  username: z.string().regex(usernamePattern),
  password,
  pin,
  display_name: z.string().min(2).max(100),
  cooperative_id: z.uuid(),
  roles: z.array(roles).min(1),
  authorizations: z.record(z.string(), z.boolean()).default({}),
});
const resetSchema = z
  .object({ action: z.literal('reset_access'), user_id: z.uuid(), password: password.optional(), pin: pin.optional() })
  .refine((value) => value.password || value.pin, { message: 'Nothing to reset' });

/** Who is asking, and whether they may manage an account with these roles in this cooperative. */
async function authorize({ user, identity }, cooperativeId, targetRoles) {
  const actor = await user.from('membership').select('*').eq('user_id', identity.id).single();
  if (actor.error) return { allowed: false };
  const isAdmin = actor.data.roles.includes('admin');
  const isManagerHere =
    actor.data.roles.includes('manager') &&
    actor.data.cooperative_id === cooperativeId &&
    targetRoles.every((role) => managerMayAssign.includes(role));
  if (isAdmin && identity.aal !== 'aal2') return { allowed: false, reason: 'AAL2 required' };
  return { allowed: isAdmin || isManagerHere, isAdmin };
}

async function createMember(context, body) {
  const permission = await authorize(context, body.cooperative_id, body.roles);
  if (!permission.allowed) return json({ error: permission.reason ?? 'Forbidden' }, 403);
  if (!permission.isAdmin) {
    // Trial workspaces are limited to the person who registered them.
    const cooperative = await context.user
      .from('cooperative')
      .select('service_plan')
      .eq('id', body.cooperative_id)
      .single();
    if (cooperative.error || cooperative.data?.service_plan === 'trial')
      return json({ error: 'trialTeamBlocked' }, 403);
  }
  const account = await context.accounts.create({
    username: body.username,
    password: body.password,
    displayName: body.display_name,
    confirmed: true,
  });
  const registered = await context.admin.rpc('provision_membership', {
    target: account.id,
    coop: body.cooperative_id,
    username: body.username,
    display_name: body.display_name,
    roles: body.roles,
    authorizations: body.authorizations,
    pin: body.pin,
    actor: context.identity.id,
  });
  if (registered.error) {
    await context.accounts.remove(account.id); // no half-created account is left behind
    throw registered.error;
  }
  return json({ id: account.id });
}

async function resetAccess(context, body) {
  if (body.user_id === context.identity.id) return json({ error: 'Use "Change password" for your own account' }, 400);
  const target = await context.admin
    .from('membership')
    .select('cooperative_id,roles')
    .eq('user_id', body.user_id)
    .single();
  if (target.error) return json({ error: 'Forbidden' }, 403);
  const permission = await authorize(context, target.data.cooperative_id, target.data.roles);
  if (!permission.allowed) return json({ error: permission.reason ?? 'Forbidden' }, 403);
  if (body.pin) {
    const changed = await context.admin.rpc('reset_member_pin', {
      target: body.user_id,
      pin: body.pin,
      actor: context.identity.id,
    });
    if (changed.error) throw changed.error;
  }
  // A new password signs the member out everywhere, so a lost phone stops working.
  if (body.password) await context.accounts.setPassword(body.user_id, body.password);
  return json({ reset: true });
}

export default async function userAdmin(request) {
  try {
    const context = await authenticate(request);
    const input = await request.json();
    if (input?.action === 'reset_access') return await resetAccess(context, resetSchema.parse(input));
    return await createMember(context, createSchema.parse(input));
  } catch (error) {
    const known = error instanceof AuthError || error instanceof Error;
    return json({ error: known ? error.message : 'Invalid request' }, 400);
  }
}
