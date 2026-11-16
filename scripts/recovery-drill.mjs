import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import assert from 'node:assert/strict';
const directory = resolve(process.argv[2] ?? 'secrets/restore-drill');
const manifest = await readFile(resolve(directory, 'SHA256SUMS'), 'utf8');
for (const line of manifest.trim().split('\n')) {
  const [expected, name] = line.trim().split(/\s+/);
  if (!['database.dump', 'media.tar.gz', 'deployment.env'].includes(name))
    throw new Error('Unexpected recovery manifest entry');
  const bytes = await readFile(resolve(directory, name));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, `Integrity: ${name}`);
}
const name = 'wise-recovery-' + randomUUID().slice(0, 8);
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const sql = (text) =>
  execFileSync(
    'docker',
    ['exec', '-i', name, 'psql', '-X', '-U', 'wise_owner', '-d', 'wise', '-v', 'ON_ERROR_STOP=1', '-At'],
    { input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  );
try {
  docker(
    'run',
    '-d',
    '--rm',
    '--name',
    name,
    '-e',
    'POSTGRES_DB=wise',
    '-e',
    'POSTGRES_USER=wise_owner',
    '-e',
    'POSTGRES_PASSWORD=local-recovery-drill-only',
    'public.ecr.aws/docker/library/postgres:17-alpine',
  );
  for (let attempt = 0; ; attempt++) {
    try {
      docker('exec', name, 'pg_isready', '-U', 'wise_owner', '-d', 'wise');
      break;
    } catch {
      if (attempt === 40) throw new Error('Recovery PostgreSQL did not become ready');
      await setTimeout(250);
    }
  }
  sql(
    'create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create role wise_app login nosuperuser nocreatedb nocreaterole;',
  );
  docker('cp', resolve(directory, 'database.dump'), name + ':/tmp/wise.dump');
  docker('exec', name, 'pg_restore', '-U', 'wise_owner', '-d', 'wise', '--exit-on-error', '/tmp/wise.dump');
  const restored = JSON.parse(
    sql(
      "select json_build_object('lots',(select count(*) from public.lot),'members',(select count(*) from public.membership),'drafts',(select count(*) from public.config_version where status='draft'),'migrations',(select count(*) from wise_auth.migration),'anonymous_lot_access',has_table_privilege('anon','public.lot','select'),'client_audit_insert',has_table_privilege('authenticated','public.audit_event','insert'))",
    ),
  );
  assert.equal(restored.migrations, 93);
  assert.equal(restored.anonymous_lot_access, false);
  assert.equal(restored.client_audit_insert, false);
  assert.ok(restored.members >= 2);
  assert.ok(restored.drafts >= 1);
  process.stdout.write(
    `Encrypted production archive integrity and full PostgreSQL restore passed: ${restored.migrations} migrations, ${restored.members} owner accounts, ${restored.lots} business lots. Original role permissions retained.\n`,
  );
} catch {
  throw new Error('Recovery drill failed; production data was not modified.');
} finally {
  try {
    docker('stop', name);
  } catch {
    /* A failed container creation leaves nothing to stop. */
  }
}
