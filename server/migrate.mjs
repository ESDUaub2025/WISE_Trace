import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

export async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query('select pg_advisory_lock(867450231)');
    await client.query(await readFile(new URL('./db/bootstrap.sql', import.meta.url), 'utf8'));
    await client.query(
      'create table if not exists wise_auth.migration(name text primary key, applied_at timestamptz not null default now())',
    );
    const directory = new URL('./migrations/', import.meta.url);
    for (const name of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
      if ((await client.query('select 1 from wise_auth.migration where name=$1', [name])).rowCount) continue;
      await client.query('begin');
      try {
        await client.query(await readFile(new URL(name, directory), 'utf8'));
        await client.query('insert into wise_auth.migration(name) values($1)', [name]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw new Error(`Migration ${name}: ${error.message}`, { cause: error });
      }
    }
    await client.query(`create or replace function wise_auth.can_login(person uuid) returns boolean
   language sql stable security definer set search_path='' as $$
    select exists(select from wise_auth.users where id=person and deleted_at is null)
     and not exists(select from public.membership where user_id=person and status='disabled')
   $$;revoke all on function wise_auth.can_login(uuid) from public;
   grant execute on function wise_auth.can_login(uuid) to service_role;`);
  } finally {
    await client.query('select pg_advisory_unlock(867450231)');
    client.release();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await migrate(pool);
    process.stdout.write('Database migrations applied. No business records seeded.\n');
  } finally {
    await pool.end();
  }
}
