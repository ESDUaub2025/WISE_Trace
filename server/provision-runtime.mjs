import { Pool } from 'pg';
const password = process.env.APP_DATABASE_PASSWORD;
if (!password || !/^[0-9a-f]{64}$/.test(password))
  throw new Error('APP_DATABASE_PASSWORD must be 64 random hex characters');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(
    `do $$ begin if not exists(select from pg_roles where rolname='wise_app') then create role wise_app login nosuperuser nocreatedb nocreaterole inherit;end if;end $$`,
  );
  // A validated hex value cannot contain a SQL quote; passwords are never logged.
  await pool.query(
    `alter role wise_app login nosuperuser nocreatedb nocreaterole nobypassrls inherit password '${password}'`,
  );
  await pool.query('grant anon,authenticated,service_role to wise_app');
  await pool.query(
    'grant usage,create on schema wise_auth to wise_app;grant all on all tables in schema wise_auth to wise_app;grant all on all sequences in schema wise_auth to wise_app',
  );
  await pool.query(
    'grant usage on schema wise_storage to service_role;grant select,insert,update,delete on all tables in schema wise_storage to service_role',
  );
  process.stdout.write('Restricted application database login prepared.\n');
} finally {
  await pool.end();
}
