import { authenticate, json } from '../_shared/http.mjs';
import { z } from 'zod';
const envelope = z.object({
  id: z.uuid(),
  cooperative_id: z.uuid(),
  author_id: z.uuid(),
  device_id: z.uuid(),
  config_version_id: z.uuid(),
  action: z.string(),
  observed_at: z.iso.datetime(),
  payload: z.record(z.string(), z.unknown()),
});
export default async (request) => {
  if (request.method === 'OPTIONS') return json({});
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);
  try {
    const { user, identity } = await authenticate(request);
    const body = z.object({ records: z.array(envelope).min(1).max(50) }).parse(await request.json());
    const receipts = [];
    for (const record of body.records) {
      if (record.author_id !== identity.id) return json({ error: 'Author mismatch' }, 403);
      const reply = await user.rpc('apply_sync', { envelope: record });
      if (reply.error) return json({ error: reply.error.message }, 400);
      receipts.push(reply.data);
    }
    return json({ receipts });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Invalid request' }, 400);
  }
};
