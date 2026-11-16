// Private photos, voice notes and training media. Nothing here is public: every read checks the
// person's access in the database, and shareable links expire within minutes (PRD §12.1).
const linkSeconds = { default: 180 };

export function registerMediaRoutes(app, { database, storage, config, identify }) {
  app.post('/api/media/:bucket/*', async (request) => {
    const identity = await identify(request);
    const file = await request.file();
    if (!file) throw new Error('Media required');
    return {
      data: await storage.upload(
        identity,
        request.params.bucket,
        request.params['*'],
        await file.toBuffer(),
        file.mimetype,
      ),
    };
  });

  app.get('/api/media/:bucket/*', async (request, reply) => {
    const file = await storage.download(await identify(request), request.params.bucket, request.params['*']);
    return reply.type(file.type).send(file.bytes);
  });

  // Access is checked when the link is made and again when it is used.
  app.post('/api/media-link/:bucket/*', async (request) => {
    const identity = await identify(request);
    await storage.download(identity, request.params.bucket, request.params['*']);
    const ticket = storage.sign(
      identity,
      request.params.bucket,
      request.params['*'],
      request.body?.expiresIn ?? linkSeconds.default,
    );
    return { data: { signedUrl: `${config.origin}/api/media-download?ticket=${ticket}` } };
  });

  app.get('/api/media-download', async (request, reply) => {
    const ticket = storage.verify(request.query.ticket);
    const allowed = await database.pool.query('select wise_auth.can_login($1) as allowed', [ticket.id]);
    if (!allowed.rows[0].allowed) throw new Error('Account unavailable');
    const file = await storage.download(ticket, ticket.bucket, ticket.name);
    return reply.type(file.type).send(file.bytes);
  });
}
