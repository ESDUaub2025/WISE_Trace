// Composition root of the API: builds the services, applies the cross-cutting protections and mounts the routes.
//   server/auth/   who is asking            server/http/     the routes
//   server/database.mjs  data access under row-level security
//   server/functions/    multi-step operations (sync, reports, user administration, ...)
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { createDatabase } from './database.mjs';
import { createAuthentication } from './auth/service.mjs';
import { AuthError, signInRequired } from './auth/errors.mjs';
import { createStorage } from './storage.mjs';
import { registerSessionRoutes } from './http/session-routes.mjs';
import { registerDataRoutes } from './http/data-routes.mjs';
import { registerMediaRoutes } from './http/media-routes.mjs';

const limits = {
  requestsPerMinute: 600, // per address, whole API; sign-in routes are stricter (server/auth/policy.mjs)
  bodyBytes: 2 * 1024 * 1024,
  uploadBytes: 10 * 1024 * 1024,
};

export async function createApp(config) {
  const app = Fastify({ logger: config.logger ?? false, bodyLimit: limits.bodyBytes, trustProxy: 1 });
  const database = createDatabase(config.connectionString);
  const authentication = createAuthentication(config);
  const storage = createStorage({ database, root: config.mediaRoot, secret: config.secret });
  await authentication.sweep();

  await app.register(rateLimit, { max: config.testMode ? 10000 : limits.requestsPerMinute, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { files: 1, fileSize: limits.uploadBytes } });
  app.decorate('database', database);
  app.decorate('authentication', authentication);
  app.addHook('onClose', async () => {
    await Promise.all([database.close(), authentication.close()]);
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'no-store');
    // Cookie-authenticated writes must come from the app's own origin. There is no CORS allowance.
    const safe = ['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (!safe && request.headers.origin !== config.origin)
      return reply.code(403).send({ error: 'Trusted origin required' });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AuthError)
      return reply.code(error.statusCode).send({ error: error.message, ...error.details });
    const status = error.statusCode ?? 400;
    if (status >= 500) request.log.error({ event: 'request_failed', code: error.code }, 'Request failed');
    return reply.code(status).send({ error: status >= 500 ? 'Request failed' : error.message });
  });

  /**
   * The person a request acts as.
   *   required      false lets anonymous requests through (public QR page)
   *   allowDisabled true for sync only: a disabled person's waiting records are still received, then flagged (FR-AUTH-06)
   *   allowPending  true only for the routes that complete a sign-in
   */
  async function identify(request, { required = true, allowDisabled = false, allowPending = false } = {}) {
    const identity = await authentication.identify(request.headers.cookie, request.headers['x-wise-user']);
    if (!identity) {
      if (required) throw signInRequired();
      return null;
    }
    if (identity.disabled && !allowDisabled) throw new AuthError('accountDisabled', 403);
    if (identity.status !== 'ready' && !allowPending) throw new AuthError('secondFactorRequired', 401);
    return identity;
  }

  app.get('/api/health', async () => {
    await database.pool.query('select 1');
    return { status: 'ok' };
  });

  const dependencies = { authentication, database, storage, config, identify };
  registerSessionRoutes(app, dependencies);
  await registerDataRoutes(app, dependencies);
  registerMediaRoutes(app, dependencies);
  return app;
}
