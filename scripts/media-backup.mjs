import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import process, { argv, env, stdout, stderr } from 'node:process';
import { URL, pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const digest = value => createHash('sha256').update(value).digest('hex');
const checked = result => { if (result.error) throw new Error('Storage operation failed'); return result.data; };
const safeName = value => typeof value === 'string' && value.length > 0 && value.length <= 1024 && ![...value].some(char => char.charCodeAt(0) < 32 || char === '\\') && value.split('/').every(part => part && part !== '.' && part !== '..');

// JSON lines keep one media object in memory. An authenticated age envelope protects
// both the object bytes and identifying metadata. No plaintext files are created.
export async function* backupRecords(client, source, bucketIds = ['evidence', 'training']) {
  const buckets = checked(await client.storage.listBuckets()).filter(bucket => bucketIds.includes(bucket.id));
  if (buckets.length !== bucketIds.length || buckets.some(bucket => bucket.public)) throw new Error('Expected private media buckets are missing');
  yield { type: 'header', version: 1, source: new URL(source).origin, created_at: new Date().toISOString(), buckets: buckets.map(bucket => ({ id: bucket.id, public: false, file_size_limit: bucket.file_size_limit, allowed_mime_types: bucket.allowed_mime_types })) };
  let count = 0;
  const manifest = createHash('sha256');
  for (const bucket of buckets) {
    const folders = [''];
    while (folders.length) {
      const folder = folders.pop();
      let offset = 0;
      for (;;) {
        const entries = checked(await client.storage.from(bucket.id).list(folder, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } }));
        for (const entry of entries) {
          const name = folder ? `${folder}/${entry.name}` : entry.name;
          if (!safeName(name)) throw new Error('Unsafe media object name');
          if (!entry.id) { folders.push(name); continue; }
          const blob = checked(await client.storage.from(bucket.id).download(name));
          const bytes = Buffer.from(await blob.arrayBuffer());
          const record = { type: 'object', bucket: bucket.id, name, size: bytes.length, sha256: digest(bytes), contentType: blob.type || entry.metadata?.mimetype || 'application/octet-stream', data: bytes.toString('base64') };
          manifest.update(JSON.stringify(record) + '\n');
          count++;
          yield record;
        }
        if (entries.length < 100) break;
        offset += entries.length;
      }
    }
  }
  yield { type: 'complete', count, sha256: manifest.digest('hex') };
}

export async function validateRecords(records, visitor = async () => {}) {
  let header, complete = false, count = 0;
  const names = new Set(), manifest = createHash('sha256');
  for await (const record of records) {
    if (complete) throw new Error('Unexpected data after completion');
    if (!header) {
      if (record.type !== 'header' || record.version !== 1 || !Array.isArray(record.buckets) || !record.buckets.length || record.buckets.some(bucket => !safeName(bucket.id) || bucket.id.includes('/') || bucket.public !== false) || new Set(record.buckets.map(bucket => bucket.id)).size !== record.buckets.length) throw new Error('Invalid archive header');
      new URL(record.source);
      header = record;
      continue;
    }
    if (record.type === 'complete') {
      if (record.count !== count || record.sha256 !== manifest.digest('hex')) throw new Error('Invalid archive manifest');
      complete = true;
      continue;
    }
    if (record.type !== 'object' || !header.buckets.some(bucket => bucket.id === record.bucket) || !safeName(record.name) || typeof record.data !== 'string' || typeof record.contentType !== 'string' || record.contentType.length > 200) throw new Error('Invalid media record');
    const key = `${record.bucket}/${record.name}`;
    if (names.has(key)) throw new Error('Duplicate media record');
    names.add(key);
    const bytes = Buffer.from(record.data, 'base64');
    if (bytes.toString('base64') !== record.data || bytes.length !== record.size || digest(bytes) !== record.sha256) throw new Error('Media integrity check failed');
    manifest.update(JSON.stringify(record) + '\n');
    count++;
    await visitor(record, bytes);
  }
  if (!header || !complete) throw new Error('Incomplete media archive');
  return { header, count };
}

export async function restoreRecords(client, readRecords, target, confirmation) {
  if (confirmation !== new URL(target).origin) throw new Error('Explicit restore target confirmation required');
  // First pass authenticates and checks ALL records before any target write.
  const { header, count } = await validateRecords(readRecords());
  if (new URL(header.source).origin === new URL(target).origin) throw new Error('Restore must use a separate recovery project');
  const buckets = checked(await client.storage.listBuckets());
  for (const expected of header.buckets) {
    const existing = buckets.find(bucket => bucket.id === expected.id);
    if (!existing || existing.public) throw new Error('Provision private recovery buckets with migrations first');
    if (checked(await client.storage.from(expected.id).list('', { limit: 1 })).length) throw new Error('Recovery bucket must be empty');
  }
  await validateRecords(readRecords(), async (record, bytes) => {
    checked(await client.storage.from(record.bucket).upload(record.name, bytes, { contentType: record.contentType, upsert: false }));
  });
  return count;
}

export async function* decryptedRecords(file, identity) {
  const child = spawn('age', ['--decrypt', '--identity', identity, file], { stdio: ['ignore', 'pipe', 'ignore'] });
  const finished = once(child, 'close');
  finished.catch(() => {});
  try {
    for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) yield JSON.parse(line);
    const [code] = await finished;
    if (code !== 0) throw new Error('Archive decryption failed');
  } finally { if (child.exitCode === null) child.kill(); }
}

async function main() {
  const [command, file] = argv.slice(2);
  if (!['backup', 'restore', 'check'].includes(command) || !file) throw new Error('Usage: node scripts/media-backup.mjs backup|restore|check ARCHIVE.age');
  if (command === 'check') {
    if (!env.AGE_IDENTITY_FILE) throw new Error('AGE_IDENTITY_FILE required');
    const { count } = await validateRecords(decryptedRecords(file, env.AGE_IDENTITY_FILE));
    stdout.write(`Media archive integrity passed: ${count} objects.\n`);
    return;
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Server-side storage credentials required');
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  if (command === 'restore') {
    if (!env.AGE_IDENTITY_FILE) throw new Error('AGE_IDENTITY_FILE required');
    const count = await restoreRecords(client, () => decryptedRecords(file, env.AGE_IDENTITY_FILE), env.SUPABASE_URL, env.RESTORE_TARGET_CONFIRM);
    stdout.write(`Recovered ${count} media objects.\n`);
    return;
  }
  if (!env.AGE_RECIPIENT) throw new Error('AGE_RECIPIENT required');
  await encryptRecords(backupRecords(client, env.SUPABASE_URL), file, env.AGE_RECIPIENT);
  stdout.write('Encrypted media archive created.\n');
}

export async function encryptRecords(records, file, recipient) {
  const child = spawn('age', ['--encrypt', '--recipient', recipient], { stdio: ['pipe', 'pipe', 'ignore'] });
  const finished = once(child, 'close');
  finished.catch(() => {});
  child.stdin.on('error', () => {});
  const output = pipeline(child.stdout, createWriteStream(file, { flags: 'wx', mode: 0o600 }));
  // Observe pipeline failures immediately so a full/broken disk cannot cause an
  // unhandled rejection while storage downloads are still running.
  output.catch(() => child.kill());
  try {
    for await (const record of records) {
      await new Promise((resolve, reject) => child.stdin.write(JSON.stringify(record) + '\n', error => error ? reject(error) : resolve()));
    }
    child.stdin.end();
    const [code] = await finished;
    await output;
    if (code !== 0) throw new Error('Archive encryption failed');
  } catch (error) { child.kill(); await output.catch(() => {}); throw error; }
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) main().catch(error => { stderr.write(`${error.message}\n`); process.exitCode = 1; });
