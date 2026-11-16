// Data-subject request (PRD §12.2): a producer leaving the programme has personal data removed while
// production records keep a pseudonymous author id.
// Step 1 anonymizes the profile in the business data (permission is checked in the database);
// step 2 empties the sign-in identity so the account can never be used again.
import { authenticate, json } from '../_shared/http.mjs';
import { z } from 'zod';

const schema = z.object({ target: z.uuid(), reason: z.string().min(3) });

export default async function subjectPrivacy(request) {
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);
  try {
    const { user, accounts } = await authenticate(request);
    const body = schema.parse(await request.json());
    const changed = await user.rpc('anonymize_producer', body);
    if (changed.error) throw changed.error;
    try {
      await accounts.anonymize(body.target);
    } catch {
      // Safe to repeat: the profile is already anonymous, only the sign-in identity remains.
      throw new Error('Profile anonymized; identity cleanup needs retry');
    }
    return json({ anonymized: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Privacy request failed' }, 400);
  }
}
