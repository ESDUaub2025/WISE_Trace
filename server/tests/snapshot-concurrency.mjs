import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { migrate } from '../migrate.mjs';
import { createDatabase, identifier } from '../database.mjs';
const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:wise-local-integration-only@127.0.0.1:55579/wise';
const maintenance = new Pool({ connectionString: url }),
  name = 'wise_concurrent_' + randomUUID().replaceAll('-', '');
await maintenance.query(`create database ${identifier(name)}`);
const target = new URL(url);
target.pathname = '/' + name;
const database = createDatabase(String(target));
let writer;
try {
  await migrate(database.pool);
  await database.pool.query(await readFile(new URL('./fixtures.sql', import.meta.url), 'utf8'));
  const identity = { id: '20000000-0000-4000-8000-000000000001', aal: 'aal1' };
  const rpc = (name, args) => database.rpc(identity, name, args);
  async function changes(from, to) {
    let position = '0';
    const rows = [];
    for (;;) {
      const page = await rpc('snapshot_changes', {
        from_snapshot: from,
        to_snapshot: to,
        after_revision: position,
        page_size: 1,
      });
      rows.push(...page.changes);
      if (page.complete) return rows;
      position = page.after_revision;
    }
  }
  const long = randomUUID(),
    fast = randomUUID(),
    coop = '10000000-0000-4000-8000-000000000001';
  const insert = (client, id) =>
    client.query(
      "insert into public.supplier(id,cooperative_id,name,type,status) values($1,$2,'Concurrent snapshot fixture','dairy','approved')",
      [id, coop],
    );
  const anchor = await rpc('snapshot_checkpoint');
  writer = await database.pool.connect();
  await writer.query('begin');
  await insert(writer, long);
  await insert(database.pool, fast);
  const first = await rpc('snapshot_checkpoint'),
    page1 = await changes(anchor.snapshot, first.snapshot);
  assert.ok(page1.some((change) => change.key === fast));
  assert.ok(!page1.some((change) => change.key === long));
  await writer.query('commit');
  writer.release();
  writer = null;
  const second = await rpc('snapshot_checkpoint'),
    page2 = await changes(first.snapshot, second.snapshot);
  assert.ok(
    page2.some((change) => change.key === long),
    'Late commits survive lower revision numbers',
  );
  assert.ok(!page2.some((change) => change.key === fast), 'Visible transactions are not transferred again');
  await database.pool.query('delete from public.supplier where id=$1', [long]);
  const third = await rpc('snapshot_checkpoint');
  assert.ok(
    (await changes(second.snapshot, third.snapshot)).some((change) => change.key === long && change.row === null),
  );
  process.stdout.write('Concurrent commit, page-size-one resume, duplicate exclusion and deletion checks passed.\n');
} finally {
  if (writer) {
    await writer.query('rollback');
    writer.release();
  }
  await database.close();
  await maintenance.query(`drop database ${identifier(name)} with(force)`);
  await maintenance.end();
}
