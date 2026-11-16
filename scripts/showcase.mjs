// Local-only showcase launcher. Never run on production.
//   node scripts/showcase.mjs demo  [--reset]   fictional cooperatives with history, plus an empty first-day producer
//   node scripts/showcase.mjs clean [--reset]   a fresh installation: only an administrator and a food-safety lead
// --reset rebuilds the chosen database first. Both modes serve on port 3007; run one at a time.
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const [mode, flag] = process.argv.slice(2);
if (!['demo', 'clean'].includes(mode)) throw new Error('Usage: node scripts/showcase.mjs <demo|clean> [--reset]');

const server = 'postgres://postgres:wise-local-integration-only@127.0.0.1:55579';
const name = mode === 'demo' ? 'wise' : 'wise_clean';
const connectionString = `${server}/${name}`;
const origin = 'http://127.0.0.1:5173';
const cleanAccount = { password: 'wise-local-showcase', pin: '2468' };

const maintenance = new Pool({ connectionString: `${server}/postgres` });
try {
  if (flag === '--reset') await maintenance.query(`drop database if exists ${name} with (force)`);
  if (!(await maintenance.query('select 1 from pg_database where datname=$1', [name])).rowCount)
    await maintenance.query(`create database ${name}`);
} finally {
  await maintenance.end();
}

if (mode === 'demo') {
  process.env.TEST_DATABASE_URL = connectionString;
  const { fixturePassword } = await import('../server/tests/serve.mjs');
  await addFirstDayProducer(fixturePassword);
  process.stdout.write(
    `Fixture accounts (rima, karim, ...) and the empty first-day account nadia: password ${fixturePassword}, PIN 2468.\n`,
  );
} else {
  await serveCleanInstallation();
}

/** Nadia: a producer on her first day in her own cooperative. One supplier, training done, no records. */
async function addFirstDayProducer(password) {
  const { hashPassword } = await import('../server/auth/passwords.mjs');
  const pool = new Pool({ connectionString });
  const coop = '10000000-0000-4000-8000-000000000099';
  const user = '20000000-0000-4000-8000-000000000099';
  try {
    await pool.query(
      `insert into public.cooperative(id,code,name,region) values($1,'TST01','Test Cooperative','Akkar') on conflict do nothing`,
      [coop],
    );
    if ((await pool.query('select 1 from public.membership where user_id=$1', [user])).rowCount) return;
    await pool.query(
      `insert into wise_auth.users(id,email,email_confirmed_at) values($1,'nadia@users.wise.invalid',now())`,
      [user],
    );
    await pool.query('insert into wise_auth.credential(user_id,password_hash) values($1,$2)', [
      user,
      await hashPassword(password),
    ]);
    await pool.query(
      `insert into public.membership(user_id,cooperative_id,username,display_name,roles,authorizations)
       values($1,$2,'nadia','Nadia Khoury','{producer}','{"receive_whey":true}')`,
      [user, coop],
    );
    await pool.query(
      `insert into private.user_pin values($1,extensions.crypt('2468',extensions.gen_salt('bf')),0,null)`,
      [user],
    );
    await pool.query(
      `insert into public.supplier values('50000000-0000-4000-8000-000000000099',$1,'Valley Dairy','dairy','approved','{}','{}')`,
      [coop],
    );
    await pool.query(
      `insert into public.training_completion values('80000000-0000-4000-8000-000000000099',$1,$2,'70000000-0000-4000-8000-000000000001','2026-01-02',100,null)`,
      [coop, user],
    );
  } finally {
    await pool.end();
  }
}

async function serveCleanInstallation() {
  const { migrate } = await import('../server/migrate.mjs');
  const { createDatabase } = await import('../server/database.mjs');
  const { createApp } = await import('../server/app.mjs');
  const database = createDatabase(connectionString);
  await migrate(database.pool);
  const empty = !(await database.pool.query('select 1 from public.membership limit 1')).rowCount;
  await database.close();
  const environment = {
    ...process.env,
    DATABASE_URL: connectionString,
    APP_ORIGIN: origin,
    AUTH_SECRET: 'local-showcase-secret-not-for-production',
  };
  if (empty) {
    const { demoConfig } = await import('../src/lib/demo.ts');
    const directory = await mkdtemp(join(tmpdir(), 'wise-showcase-'));
    const file = join(directory, 'bootstrap.json');
    const account = (username, display_name) => ({ username, display_name, ...cleanAccount });
    await writeFile(
      file,
      JSON.stringify({
        cooperative: { code: 'WISEADMIN', name: 'WISE Platform Administration', region: 'Lebanon' },
        admin: account('wise_admin', 'Project administrator'),
        food_safety: account('wise_food_safety', 'Food-safety lead'),
        configuration: demoConfig.definition,
      }),
    );
    const result = spawnSync(process.execPath, ['server/bootstrap.mjs', file], { env: environment, stdio: 'inherit' });
    await rm(directory, { recursive: true, force: true });
    if (result.status) throw new Error('Clean bootstrap failed');
  }
  const app = await createApp({
    connectionString,
    origin,
    secret: environment.AUTH_SECRET,
    mediaRoot: fileURLToPath(new URL('../out/showcase-media', import.meta.url)),
    allowLocalSignUp: true,
    testMode: true,
  });
  await app.listen({ host: '127.0.0.1', port: 3007 });
  process.stdout.write(
    `Clean local API ready on port 3007. Sign in as wise_admin or wise_food_safety / ${cleanAccount.password} / PIN ${cleanAccount.pin}.\n`,
  );
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
      await app.close();
      process.exit(0);
    });
  }
}
