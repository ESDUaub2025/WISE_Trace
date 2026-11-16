import { test } from 'node:test';
import { Blob, Buffer } from 'node:buffer';
import { deserialize, serialize } from 'node:v8';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { backupRecords, restoreRecords, validateRecords, encryptRecords, decryptedRecords } from './media-backup.mjs';

function storageFixture(objects = {}, pageSize = 100) {
  const uploaded = [];
  const buckets = ['evidence', 'training'].map((id) => ({ id, public: false }));
  return {
    uploaded,
    storage: {
      listBuckets: async () => ({ data: buckets }),
      from: (bucket) => ({
        list: async (folder, { offset = 0, limit = pageSize } = {}) => {
          const entries = new Map();
          for (const path of Object.keys(objects[bucket] || {})) {
            if (folder && !path.startsWith(`${folder}/`)) continue;
            const rest = folder ? path.slice(folder.length + 1) : path;
            const [name, next] = rest.split('/');
            entries.set(name, { name, id: next ? null : name });
          }
          return {
            data: [...entries.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(offset, offset + limit),
          };
        },
        download: async (name) => ({ data: new Blob([objects[bucket][name]], { type: 'image/jpeg' }) }),
        upload: async (name, bytes, options) => {
          assert.equal(options.upsert, false);
          uploaded.push({ bucket, name, bytes, options });
          return { data: {} };
        },
      }),
    },
  };
}
async function archive(source) {
  return Array.fromAsync(backupRecords(source, 'https://source.supabase.co'));
}
test('recursive paginated backup preserves exact media bytes, names and private buckets', async () => {
  const files = Object.fromEntries(
    Array.from({ length: 105 }, (_, i) => [`coop/user/photo-${String(i).padStart(3, '0')}.jpg`, `bytes-${i}`]),
  );
  const records = await archive(storageFixture({ evidence: files, training: { 'cfg/lesson/video.webm': 'video' } }));
  const result = await validateRecords(records);
  assert.equal(result.count, 106);
  const target = storageFixture();
  assert.equal(
    await restoreRecords(target, () => records, 'https://recovery.supabase.co', 'https://recovery.supabase.co'),
    106,
  );
  assert.equal(target.uploaded.find((item) => item.name.endsWith('photo-104.jpg')).bytes.toString(), 'bytes-104');
});
test('corruption or truncation rejects whole archive before any upload', async () => {
  const original = await archive(storageFixture({ evidence: { 'a.jpg': 'one', 'b.jpg': 'two' } }));
  for (const change of [
    (records) => records.slice(0, -1),
    (records) => {
      records[2].data = Buffer.from('modified').toString('base64');
      return records;
    },
    (records) => {
      records.at(-1).count++;
      return records;
    },
  ]) {
    const records = change(deserialize(serialize(original))),
      target = storageFixture();
    await assert.rejects(
      restoreRecords(target, () => records, 'https://recovery.supabase.co', 'https://recovery.supabase.co'),
    );
    assert.equal(target.uploaded.length, 0);
  }
});
test('requires explicit separate target and empty private buckets', async () => {
  const records = await archive(storageFixture({ training: { 'a.jpg': 'test' } }));
  for (const [target, confirmation, client] of [
    ['https://recovery.supabase.co', '', storageFixture()],
    ['https://source.supabase.co', 'https://source.supabase.co', storageFixture()],
    [
      'https://recovery.supabase.co',
      'https://recovery.supabase.co',
      storageFixture({ evidence: { 'existing.jpg': 'keep' } }),
    ],
  ]) {
    await assert.rejects(restoreRecords(client, () => records, target, confirmation));
    assert.equal(client.uploaded.length, 0);
  }
});
test('unsafe names, duplicate objects and public buckets fail validation', async () => {
  const original = await archive(storageFixture({ evidence: { 'a.jpg': 'test' } }));
  for (const records of [
    [original[0], { ...original[1], name: '../escape' }, original[2]],
    [original[0], original[1], original[1], original[2]],
    [{ ...original[0], buckets: [{ id: 'evidence', public: true }] }, original[1], original[2]],
  ])
    await assert.rejects(validateRecords(records));
});
test('actual age encryption round trip rejects tampering and wrong identity', async () => {
  try {
    execFileSync('age', ['--version'], { stdio: 'pipe' });
  } catch {
    throw new Error('Install age and age-keygen for the recovery integration check');
  }
  const temporary = await mkdtemp(join(tmpdir(), 'wise-recovery-'));
  try {
    const identity = execFileSync('age-keygen', [], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const key = join(temporary, 'identity.txt');
    await writeFile(key, identity, { mode: 0o600 });
    const recipient = execFileSync('age-keygen', ['-y', key], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const records = await archive(storageFixture({ evidence: { 'coop/receipt.jpg': 'sensitive receipt' } }));
    const file = join(temporary, 'archive.age');
    await encryptRecords(records, file, recipient);
    const ciphertext = await readFile(file);
    assert.equal(ciphertext.includes(Buffer.from('sensitive receipt')), false);
    assert.equal(ciphertext.includes(Buffer.from('receipt.jpg')), false);
    assert.equal((await validateRecords(decryptedRecords(file, key))).count, 1);
    // Existing encrypted archives are never replaced, even with a valid key.
    await assert.rejects(encryptRecords(records, file, recipient));
    assert.deepEqual(await readFile(file), ciphertext);
    ciphertext[ciphertext.length - 8] ^= 1;
    const tampered = join(temporary, 'tampered.age');
    await writeFile(tampered, ciphertext);
    await assert.rejects(validateRecords(decryptedRecords(tampered, key)));
    const other = join(temporary, 'other.txt');
    await writeFile(other, execFileSync('age-keygen', [], { stdio: ['ignore', 'pipe', 'ignore'] }), { mode: 0o600 });
    await assert.rejects(validateRecords(decryptedRecords(file, other)));
  } finally {
    assert.equal(dirname(resolve(temporary)), resolve(tmpdir()));
    assert.ok(temporary.split(/[\\/]/).at(-1).startsWith('wise-recovery-'));
    await rm(temporary, { recursive: true });
  }
});
