import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Envelope } from '../lib/domain';
import { ids } from '../lib/demo';

let database: { epoch: string; version: number; users: { username: string }[]; records: unknown[] };
let conflictOnce: boolean;
let captured: Record<string, unknown>[];
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_FILE_BACKEND_URL', 'https://script.google.com/macros/s/test-unit/exec');
  database = { epoch: 'new-workspace', version: 0, users: [], records: [] };
  conflictOnce = false;
  captured = [];
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, options: RequestInit) => {
      expect(options.credentials).toBe('omit');
      expect(options.headers).toEqual({ 'Content-Type': 'text/plain;charset=UTF-8' });
      const input = JSON.parse(String(options.body));
      captured.push(input);
      expect(input).not.toHaveProperty('accessKey');
      expect(input.mode).toBe('username-only-v2');
      let reply: unknown;
      if (input.action === 'login') {
        if (!database.users.some((user) => user.username === input.username))
          database.users.push({ username: input.username });
        reply = {
          ok: true,
          mode: input.mode,
          epoch: database.epoch,
          user: { username: input.username, canWrite: true },
        };
      } else if (input.epoch !== database.epoch) reply = { ok: false, error: 'workspace_reset' };
      else if (input.action === 'read') reply = { ok: true, data: structuredClone(database) };
      else if (input.action === 'upsert') {
        if (conflictOnce) {
          conflictOnce = false;
          database.version += 1;
          reply = { ok: false, error: 'conflict_reload' };
        } else {
          database.records.push({
            id: input.id,
            value: input.value,
            createdBy: input.username,
            updatedBy: input.username,
          });
          reply = { ok: true, version: ++database.version };
        }
      }
      return new Response(JSON.stringify(reply), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function action(): Promise<Envelope> {
  const { fileUserId } = await import('./file-backend');
  return {
    id: 'a0000000-0000-4000-8000-000000000001',
    author_id: await fileUserId('alice'),
    cooperative_id: ids.coop,
    device_id: ids.device,
    config_version_id: ids.config,
    observed_at: '2026-11-15T10:00:00.000Z',
    action: 'batch',
    payload: { quantity: 10 },
  };
}

describe('temporary open testing transport', () => {
  it('creates an account using only a normalized name and remembers it across reloads', async () => {
    const backend = await import('./file-backend');
    const identity = await backend.signInToFile(' ALICE ');
    expect(identity.username).toBe('alice');
    expect(backend.fileCanWrite()).toBe(true);
    expect((await backend.resumeFileSession())?.id).toBe(identity.id);
    expect(database.users).toEqual([{ username: 'alice' }]);
    backend.clearFileSession();
    expect(await backend.resumeFileSession()).toBeNull();
  });
  it('rejects invalid usernames before making a network request', async () => {
    const backend = await import('./file-backend');
    for (const name of ['', 'a', '../bad', '__proto__', 'x'.repeat(41)])
      await expect(backend.signInToFile(name)).rejects.toThrow('fileInvalidUsername');
    expect(captured).toHaveLength(0);
    expect((await backend.signInToFile('رنا')).username).toBe('رنا');
  });
  it('retries a conflicted append and recognizes an already saved action', async () => {
    const backend = await import('./file-backend');
    await backend.signInToFile('alice');
    conflictOnce = true;
    await backend.sendFileAction(await action());
    await backend.sendFileAction(await action());
    expect(database.records).toHaveLength(1);
    expect(captured.filter((input) => input.action === 'upsert')).toHaveLength(2);
    expect((await backend.readFileWorkspace()).actions[0].id).toBe((await action()).id);
  });
  it('uses server-stamped usernames and includes only newly registered people', async () => {
    const backend = await import('./file-backend');
    await backend.signInToFile('alice');
    database.users.push({ username: 'bob' });
    database.records = [
      { id: (await action()).id, createdBy: 'bob', value: { kind: 'wise-action', envelope: await action() } },
    ];
    const workspace = await backend.readFileWorkspace();
    expect(workspace.actions[0].author_id).toBe(await backend.fileUserId('bob'));
    expect(workspace.members.map((member) => member.username)).toEqual(['alice', 'bob']);
  });
  it('rejects old workspace writes and writes for a different active name', async () => {
    const backend = await import('./file-backend');
    await backend.signInToFile('bob');
    await expect(backend.sendFileAction(await action())).rejects.toThrow();
    await backend.signInToFile('alice');
    database.epoch = 'reset-workspace';
    await expect(backend.sendFileAction(await action())).rejects.toThrow('fileWorkspaceReset');
    expect(database.records).toHaveLength(0);
  });
  it('does not create an in-memory account against an outdated keyed service', async () => {
    const backend = await import('./file-backend');
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: 'invalid_credentials' })));
    await expect(backend.signInToFile('alice')).rejects.toThrow('fileServiceUpdating');
    expect(backend.fileIdentity()).toBeNull();
  });
});

it('a fresh file workspace has no sample people, business records or equipment', async () => {
  const { emptyTestWorkspace } = await import('./empty-workspace');
  const workspace = emptyTestWorkspace([]);
  for (const field of [
    'members',
    'lots',
    'suppliers',
    'tasks',
    'records',
    'equipment',
    'completions',
    'sales',
    'edges',
  ] as const)
    expect(workspace[field]).toHaveLength(0);
  expect(JSON.stringify(workspace)).not.toContain('Akkar Harvest');
  expect(JSON.stringify(workspace)).not.toContain('Rima Haddad');
});
