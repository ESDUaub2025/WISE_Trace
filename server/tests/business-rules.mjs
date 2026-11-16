import { Pool } from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { migrate } from '../migrate.mjs';
import { identifier } from '../database.mjs';
const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:wise-local-integration-only@127.0.0.1:55580/wise';
const maintenance = new Pool({ connectionString: url });
const name = `wise_rules_${randomUUID().replaceAll('-', '')}`;
await maintenance.query(`create database ${identifier(name)}`);
const target = new URL(url);
target.pathname = `/${name}`;
const pool = new Pool({ connectionString: String(target) });
let count = 0,
  failed = 0;
try {
  await migrate(pool);
  await pool.query(
    'create extension pgtap with schema extensions;grant execute on all functions in schema extensions to anon,authenticated,service_role',
  );
  await pool.query(await readFile(new URL('./fixtures.sql', import.meta.url), 'utf8'));
  const client = await pool.connect();
  try {
    for (const name of (await readdir(new URL('./sql/', import.meta.url)))
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      try {
        const results = await client.query(await readFile(new URL(`./sql/${name}`, import.meta.url), 'utf8'));
        const lines = []
          .concat(results)
          .flatMap((result) => result.rows ?? [])
          .flatMap((row) => Object.values(row))
          .filter((value) => typeof value === 'string');
        const assertions = lines.filter((line) => /^(not )?ok \d+/.test(line));
        count += assertions.length;
        const failures = lines.filter((line) => /^not ok|^# (Looks like|No tests)/m.test(line));
        if (failures.length) {
          failed += failures.length;
          process.stderr.write(`${name}: ${failures.join('\n')}\n`);
        } else process.stdout.write(`${name}: ${assertions.length} passed\n`);
      } catch (error) {
        failed++;
        await client.query('rollback');
        process.stderr.write(`${name}: ${error.message}\n`);
      }
    }
  } finally {
    client.release();
  }
  if (count < 306) throw new Error(`Only ${count} assertions ran; expected at least 306`);
  if (failed) throw new Error(`${failed} database failures`);
  process.stdout.write(`${count} business and security assertions passed on standalone PostgreSQL.\n`);
} finally {
  await pool.end();
  await maintenance.query(`drop database ${identifier(name)} with(force)`);
  await maintenance.end();
}
