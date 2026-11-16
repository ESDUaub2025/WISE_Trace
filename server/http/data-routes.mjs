// Data routes: read a table, call a database function, or run a server operation.
// Every call runs in the database as the signed-in person, so row-level security decides what they see.
import { scopedClient } from '../database.mjs';
import { requestContext } from '../context.mjs';

const operationNames = ['sync', 'report', 'ocr', 'user-admin', 'subject-privacy', 'notifications'];

export async function registerDataRoutes(app, { authentication, database, config, identify }) {
  const operations = new Map();
  for (const name of operationNames) operations.set(name, (await import(`../functions/${name}/index.mjs`)).default);

  app.post('/api/query', async (request) => {
    const identity = await identify(request);
    if (request.body?.update) throw new Error('Direct writes forbidden');
    return { data: await database.query(identity, request.body) };
  });

  // Anonymous callers reach only the functions granted to the "anon" role (the public QR page).
  app.post('/api/rpc/:name', async (request) => {
    const identity = await identify(request, { required: false });
    return { data: await database.rpc(identity, request.params.name, request.body ?? {}) };
  });

  app.post('/api/functions/:name', async (request, reply) => {
    const operation = operations.get(request.params.name);
    if (!operation) return reply.code(404).send({ error: 'Operation unavailable' });
    const identity = await identify(request, { allowDisabled: request.params.name === 'sync' });
    const context = {
      user: scopedClient(database, identity), // acts as the person
      admin: scopedClient(database, { service: true }), // acts as the server, after the operation has checked permission
      identity: { id: identity.id, email: identity.user.email, aal: identity.aal, roles: identity.roles },
      accounts: authentication.accounts,
    };
    const forwarded = new Request(new URL(request.url, config.origin), {
      method: 'POST',
      body: JSON.stringify(request.body ?? {}),
    });
    const response = await requestContext.run(context, () => operation(forwarded));
    for (const [key, value] of response.headers) reply.header(key, value);
    return reply.code(response.status).send(Buffer.from(await response.arrayBuffer()));
  });
}
