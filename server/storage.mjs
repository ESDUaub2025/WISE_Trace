import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';

export function mediaPath(root, bucket, name) {
  if (
    !['evidence', 'training'].includes(bucket) ||
    typeof name !== 'string' ||
    !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{1,8}$/i.test(name)
  )
    throw new Error('Invalid media path');
  const path = resolve(root, bucket, name);
  if (!path.startsWith(resolve(root) + sep)) throw new Error('Invalid media path');
  return path;
}
export function createStorage({ database, root, secret }) {
  async function upload(identity, bucket, name, file, type) {
    const path = mediaPath(root, bucket, name);
    const result = await database.pool.query('select * from wise_storage.buckets where id=$1', [bucket]);
    const config = result.rows[0];
    if (!config || file.length > Number(config.file_size_limit) || !config.allowed_mime_types.includes(type))
      throw new Error('Unsupported media type or size');
    // Content is never publicly served. Atomic exclusive creation prevents overwrite.
    await mkdir(resolve(path, '..'), { recursive: true, mode: 0o700 });
    await writeFile(path, file, { flag: 'wx', mode: 0o600 });
    try {
      await database.transaction(identity, (client) =>
        client.query('insert into wise_storage.objects(id,bucket_id,name,metadata) values($1,$2,$3,$4)', [
          randomUUID(),
          bucket,
          name,
          JSON.stringify({ mimetype: type, size: file.length }),
        ]),
      );
    } catch (error) {
      await unlink(path);
      throw error;
    }
    return { path: name };
  }
  async function download(identity, bucket, name) {
    const path = mediaPath(root, bucket, name);
    const result = await database.transaction(identity, (client) =>
      client.query('select metadata from wise_storage.objects where bucket_id=$1 and name=$2', [bucket, name]),
    );
    if (!result.rowCount) throw new Error('Media unavailable');
    return { bytes: await readFile(path), type: result.rows[0].metadata.mimetype };
  }
  function signature(value) {
    return createHmac('sha256', secret).update(value).digest('base64url');
  }
  function sign(identity, bucket, name, seconds) {
    mediaPath(root, bucket, name);
    const value = Buffer.from(
      JSON.stringify({
        id: identity.id,
        aal: identity.aal,
        bucket,
        name,
        exp: Date.now() + Math.min(180, Math.max(1, seconds)) * 1000,
      }),
    ).toString('base64url');
    return `${value}.${signature(value)}`;
  }
  function verify(token) {
    const [value, mac] = String(token).split('.');
    const expected = signature(value ?? '');
    if (!mac || mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected)))
      throw new Error('Invalid media link');
    const payload = JSON.parse(Buffer.from(value, 'base64url').toString());
    if (payload.exp < Date.now()) throw new Error('Expired media link');
    return payload;
  }
  return { upload, download, sign, verify };
}
