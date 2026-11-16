// HTTP routes for signing in and out. Rules are in server/auth/service.mjs; this file only translates
// between HTTP and that service. The session cookie is HttpOnly: the app never sees its value.
import { z } from 'zod';
import { authPolicy } from '../auth/policy.mjs';
import { AuthError } from '../auth/errors.mjs';
import { readProfile, unlockProfile } from '../auth/profile.mjs';

const body = (schema, request) => {
  const parsed = schema.safeParse(request.body ?? {});
  if (!parsed.success) throw new AuthError('invalidRequest', 400);
  return parsed.data;
};

export function registerSessionRoutes(app, { authentication, database, config, identify }) {
  const strict = {
    config: { rateLimit: config.testMode ? { max: 10000, timeWindow: '1 minute' } : authPolicy.signInRateLimit },
  };
  const cookieOf = (request) => request.headers.cookie;
  /** Routes for a sign-in that may still be waiting for its authenticator code. */
  const pendingIdentity = async (request) => {
    const identity = await identify(request, { allowPending: true });
    if (identity.disabled) throw new AuthError('accountDisabled', 403);
    return identity;
  };

  app.get('/api/capabilities', async () => authentication.capabilities());

  // Everyone signed in on this browser. The app uses it to decide between "enter PIN" and "enter password".
  app.get('/api/session', async (request) => ({ people: await authentication.people(cookieOf(request)) }));

  app.post('/api/session/sign-in', strict, async (request, reply) => {
    const { identifier, password } = body(
      z.object({ identifier: z.string().min(1).max(254), password: z.string().min(1).max(1024) }),
      request,
    );
    const result = await authentication.signIn({
      identifier,
      password,
      cookieHeader: cookieOf(request),
      userAgent: request.headers['user-agent'],
    });
    reply.header('set-cookie', result.setCookie);
    return { login: result.login };
  });

  app.post('/api/session/second-factor/setup', strict, async (request) =>
    authentication.beginSecondFactor(await pendingIdentity(request)),
  );

  app.post('/api/session/second-factor', strict, async (request) => {
    const { code } = body(z.object({ code: z.string().regex(/^\d{6}$/) }), request);
    return { login: await authentication.proveSecondFactor(await pendingIdentity(request), code) };
  });

  app.get('/api/session/profile', async (request) => readProfile(database, await identify(request)));

  app.post('/api/session/unlock', strict, async (request) => {
    const input = body(
      z.object({ pin: z.string().max(12), device_id: z.uuid(), device_label: z.string().max(120).optional() }),
      request,
    );
    return unlockProfile(database, await identify(request), {
      pin: input.pin,
      deviceId: input.device_id,
      deviceLabel: input.device_label,
    });
  });

  app.post('/api/session/sign-out', async (request, reply) => {
    const { user_id: userId } = body(z.object({ user_id: z.uuid().optional() }), request);
    const clearing = await authentication.signOut(cookieOf(request), userId ?? null);
    if (clearing) reply.header('set-cookie', clearing);
    return { signed_out: true };
  });

  app.post('/api/session/password', strict, async (request) => {
    const input = body(z.object({ current: z.string().max(1024), next: z.string().max(1024) }), request);
    await authentication.changePassword(await identify(request), input.current, input.next);
    return { changed: true };
  });

  app.post('/api/session/sign-up', strict, async (request) => {
    const input = body(
      z.object({
        email: z.string().max(254),
        password: z.string().max(1024),
        display_name: z.string().max(100).optional(),
      }),
      request,
    );
    await authentication.signUp({ email: input.email, password: input.password, displayName: input.display_name });
    return { status: 'verification_sent' };
  });

  // Opened from the verification email, so it answers with a redirect back into the app.
  app.get('/api/session/verify-email', strict, async (request, reply) => {
    const verified = await authentication.verifyEmail(request.query.token);
    return reply.redirect(`${config.origin}/?email=${verified ? 'verified' : 'expired'}`);
  });

  app.post('/api/session/password-reset', strict, async (request) => {
    const { email } = body(z.object({ email: z.string().max(254) }), request);
    await authentication.requestPasswordReset(email);
    return { status: 'sent_if_known' };
  });

  app.post('/api/session/password-reset/confirm', strict, async (request) => {
    const input = body(z.object({ token: z.string().max(200), password: z.string().max(1024) }), request);
    await authentication.resetPassword(input.token, input.password);
    return { changed: true };
  });
}
