// Local-only API with fictional fixtures, for development and the live browser tests.
// Never called by production entry points; it refuses any database that is not on this machine.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createApp } from '../app.mjs';
import { createDatabase } from '../database.mjs';
import { migrate } from '../migrate.mjs';
import { hashPassword } from '../auth/passwords.mjs';

export const fixturePassword = 'wise-demo-only'; // every fixture account; PIN 2468 comes from fixtures.sql

const connectionString =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:wise-local-integration-only@127.0.0.1:55579/wise';
if (!['127.0.0.1', 'localhost'].includes(new URL(connectionString).hostname))
  throw new Error('Fixture server is localhost only');

const database = createDatabase(connectionString);
await migrate(database.pool);
await database.close();

const app = await createApp({
  connectionString,
  origin: 'http://127.0.0.1:5173',
  secret: 'local-fixture-server-secret-not-for-production',
  mediaRoot: fileURLToPath(new URL('../../out/test-media', import.meta.url)),
  allowLocalSignUp: true,
  testMode: true,
});

if (!(await app.database.pool.query('select 1 from public.membership limit 1')).rowCount) {
  await app.database.pool.query(await readFile(new URL('./fixtures.sql', import.meta.url), 'utf8'));
}
// Fixture members come from SQL without passwords; give each one the shared fixture password.
await app.database.pool.query(
  `insert into wise_auth.credential(user_id, password_hash)
   select m.user_id, $1 from public.membership m on conflict(user_id) do nothing`,
  [await hashPassword(fixturePassword)],
);

await app.listen({ host: '127.0.0.1', port: 3007 });
process.stdout.write('Local integration API ready on port 3007.\n');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
}
