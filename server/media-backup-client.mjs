import { Pool } from 'pg';
import { Blob } from 'node:buffer';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { mediaPath } from './storage.mjs';
export function createLocalMediaClient(connectionString, root) {
  const pool = new Pool({ connectionString, max: 1, allowExitOnIdle: true });
  const result = async (operation) => {
    try {
      return { data: await operation(), error: null };
    } catch (error) {
      return { data: null, error };
    }
  };
  return {
    close: () => pool.end(),
    storage: {
      listBuckets: () => result(async () => (await pool.query('select * from wise_storage.buckets order by id')).rows),
      from(bucket) {
        return {
          list: (folder, { offset = 0, limit = 100 } = {}) =>
            result(async () => {
              const prefix = folder ? folder + '/' : '';
              const rows = (
                await pool.query('select id,name from wise_storage.objects where bucket_id=$1 order by name', [bucket])
              ).rows;
              const children = new Map();
              for (const row of rows) {
                if (!row.name.startsWith(prefix)) continue;
                const relative = row.name.slice(prefix.length),
                  name = relative.split('/')[0];
                children.set(name, { name, id: relative.includes('/') ? null : row.id });
              }
              return [...children.values()].slice(offset, offset + limit);
            }),
          download: (name) =>
            result(async () => {
              const metadata = (
                await pool.query('select metadata from wise_storage.objects where bucket_id=$1 and name=$2', [
                  bucket,
                  name,
                ])
              ).rows[0];
              if (!metadata) throw new Error('Media metadata missing');
              return new Blob([await readFile(mediaPath(root, bucket, name))], { type: metadata.metadata.mimetype });
            }),
          upload: (name, bytes, { contentType }) =>
            result(async () => {
              const path = mediaPath(root, bucket, name);
              await mkdir(dirname(path), { recursive: true, mode: 0o700 });
              await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
              // Restore the database dump first; never replace existing file bytes.
              const existing = await pool.query('select 1 from wise_storage.objects where bucket_id=$1 and name=$2', [
                bucket,
                name,
              ]);
              if (!existing.rowCount)
                await pool.query('insert into wise_storage.objects(bucket_id,name,metadata) values($1,$2,$3)', [
                  bucket,
                  name,
                  JSON.stringify({ mimetype: contentType, size: bytes.length }),
                ]);
              return { path: name };
            }),
        };
      },
    },
  };
}
