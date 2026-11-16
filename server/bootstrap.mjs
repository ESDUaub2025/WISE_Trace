// First-time set-up of an empty installation: one administration workspace, a WISE Admin and a
// Food-Safety Lead (two different people, PRD FR-CFG-02), and an unapproved procedure draft.
// Usage: node server/bootstrap.mjs <file.json>   (see docs/owner.bootstrap.example.json)
// It refuses to run on an installation that already has members, and creates no sample records.
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createDatabase } from './database.mjs';
import { createAuthentication } from './auth/service.mjs';
import { pinPattern, usernamePattern } from './auth/policy.mjs';

// Owner accounts get a longer minimum than ordinary members.
const account = z.object({
  username: z.string().regex(usernamePattern),
  display_name: z.string().min(2),
  password: z.string().min(16),
  pin: z.string().regex(pinPattern),
});
const schema = z.object({
  cooperative: z.object({
    code: z.string().regex(/^[A-Z0-9]{3,12}$/),
    name: z.string().min(3),
    region: z.string().min(2),
  }),
  admin: account,
  food_safety: account,
  configuration: z.record(z.string(), z.unknown()),
});

const input = schema.parse(JSON.parse(await readFile(process.argv[2] ?? '/run/wise.bootstrap.json', 'utf8')));
if (input.admin.username === input.food_safety.username)
  throw new Error('Separate administrator and food-safety accounts required');

const database = createDatabase(process.env.DATABASE_URL);
const authentication = createAuthentication({
  connectionString: process.env.DATABASE_URL,
  origin: process.env.APP_ORIGIN,
  secret: process.env.AUTH_SECRET,
});
const created = [];
try {
  if ((await database.pool.query('select 1 from public.membership limit 1')).rowCount)
    throw new Error('Installation already initialized');
  for (const role of ['admin', 'food_safety']) {
    const details = input[role];
    const identity = await authentication.accounts.create({
      username: details.username,
      password: details.password,
      displayName: details.display_name,
      confirmed: true,
    });
    created.push(identity.id);
    details.id = identity.id;
    details.role = role;
  }
  const members = [input.admin, input.food_safety].map(({ id, username, display_name, pin, role }) => ({
    id,
    username,
    display_name,
    pin,
    role,
  }));
  // The database function checks again that the installation is empty before writing anything.
  await database.rpc({ service: true }, 'bootstrap_installation', {
    coop: randomUUID(),
    details: input.cooperative,
    accounts: members,
    configuration: input.configuration,
  });
  process.stdout.write(
    'Administrator and food-safety accounts created. No sample business data. Production configuration remains an unapproved draft.\n',
  );
} catch (error) {
  for (const id of created) await authentication.accounts.remove(id).catch(() => {});
  throw error;
} finally {
  await database.close();
  await authentication.close();
}
