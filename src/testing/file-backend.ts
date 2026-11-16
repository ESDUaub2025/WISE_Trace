import type { Identity, Envelope } from '../lib/domain';
import { envelopeSchema } from '../lib/domain';
import { ids } from '../lib/demo';
import { validateTestAction } from './action-validation';
import { connectivity } from '../connectivity/connectivity';
import { fileBackendUrl, fileTesting } from './file-mode';

export { fileBackendUrl, fileTesting };

interface Credentials {
  username: string;
  epoch?: string;
}
interface FileUser {
  username: string;
  canWrite: boolean;
}
export interface FileRecord {
  id: string;
  value: Record<string, unknown>;
  createdBy: string;
  updatedBy: string;
}
interface FileDatabase {
  epoch: string;
  version: number;
  users: { username: string }[];
  records: FileRecord[];
}
interface Reply {
  ok: boolean;
  mode?: string;
  epoch?: string;
  error?: string;
  user?: FileUser;
  data?: FileDatabase;
  version?: number;
}
let session: { credentials: Credentials; user: FileUser; identity: Identity } | null = null;

export const openTestMode = 'username-only-v2';
const rememberedName = 'wise-open-test-username:v2';
const rememberedEpoch = 'wise-open-test-epoch:v2';
// Only the username and the workspace it belongs to are remembered. This intentionally provides no authentication.
export const fileIdentity = () => session?.identity ?? null;
export const fileCanWrite = () => session?.user.canWrite === true;
export const fileEpoch = () => session?.credentials.epoch;
export function clearFileSession() {
  session = null;
  localStorage.removeItem(rememberedName);
  localStorage.removeItem(rememberedEpoch);
}

export function fileError(code?: string) {
  const keys: Record<string, string> = {
    invalid_credentials: 'fileServiceUpdating',
    invalid_username: 'fileInvalidUsername',
    login_required: 'fileUsernameRequired',
    workspace_reset: 'fileWorkspaceReset',
    forbidden: 'fileReadOnly',
    conflict_reload: 'fileConflict',
    busy_retry_later: 'fileBusy',
    test_database_full: 'fileDatabaseFull',
  };
  return new Error(keys[code ?? ''] ?? 'fileRequestFailed');
}

async function call(input: Record<string, unknown>, credentials = session?.credentials): Promise<Reply> {
  if (!fileBackendUrl || !credentials) throw fileError('invalid_credentials');
  let response: Response;
  try {
    response = await fetch(fileBackendUrl, {
      method: 'POST',
      credentials: 'omit',
      redirect: 'follow',
      cache: 'no-store',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ ...input, ...credentials, mode: openTestMode }),
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    // Tell the connection indicator at once instead of waiting for its next scheduled check.
    connectivity.reportFailure();
    throw new Error('serverUnreachable');
  }
  connectivity.reportReached();
  let result: Reply;
  try {
    result = (await response.json()) as Reply;
  } catch {
    throw new Error('fileRequestFailed');
  }
  if (!response.ok || typeof result.ok !== 'boolean') throw new Error('fileRequestFailed');
  return result;
}

// Stable IDs let separate devices agree on the username in this open test workspace.
export async function fileUserId(username: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`wise-open-test-v2:${username}`));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function fileUserIdentity(username: string): Promise<Identity> {
  return {
    id: await fileUserId(username),
    cooperative_id: ids.coop,
    username,
    display_name: username,
    roles: ['producer', 'supervisor', 'manager'],
    authorizations: { receive_whey: true },
  };
}

export async function signInToFile(username: string): Promise<Identity> {
  const normalized = username.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\p{M}_. -]{1,39}$/u.test(normalized)) throw new Error('fileInvalidUsername');
  const credentials: Credentials = { username: normalized };
  const reply = await call({ action: 'login' }, credentials);
  if (!reply.ok || !reply.user || reply.user.username !== credentials.username) throw fileError(reply.error);
  if (reply.mode !== openTestMode || !reply.epoch) throw new Error('fileServiceUpdating');
  credentials.epoch = reply.epoch;
  const user = reply.user;
  const identity = await fileUserIdentity(user.username);
  session = { credentials, user, identity };
  localStorage.setItem(rememberedName, identity.username);
  localStorage.setItem(rememberedEpoch, reply.epoch);
  localStorage.setItem(`wise-help:v1:${identity.id}`, 'seen');
  return identity;
}

/**
 * Reopens the app for the remembered person.
 * Without a connection the person still gets their saved work: the shared file is asked again as soon as
 * it can be reached, and a workspace that was reset meanwhile ends this session then (fileWorkspaceReset).
 */
export async function resumeFileSession(): Promise<Identity | null> {
  const username = localStorage.getItem(rememberedName);
  if (!username) return null;
  try {
    return await signInToFile(username);
  } catch (error) {
    const epoch = localStorage.getItem(rememberedEpoch);
    if (epoch && error instanceof Error && error.message === 'serverUnreachable') {
      const identity = await fileUserIdentity(username);
      session = { credentials: { username, epoch }, user: { username, canWrite: true }, identity };
      return identity;
    }
    session = null;
    return null;
  }
}

export async function readFileDatabase(): Promise<FileDatabase> {
  const reply = await call({ action: 'read' });
  if (!reply.ok) throw fileError(reply.error);
  if (
    !reply.data ||
    reply.data.epoch !== fileEpoch() ||
    !Number.isInteger(reply.data.version) ||
    !Array.isArray(reply.data.records) ||
    !Array.isArray(reply.data.users)
  )
    throw new Error('fileRequestFailed');
  return reply.data;
}

export async function readFileWorkspace(): Promise<{ actions: Envelope[]; members: Identity[] }> {
  const database = await readFileDatabase();
  const actions: Envelope[] = [];
  for (const record of database.records) {
    if (record.value.kind !== 'wise-action') continue;
    const parsed = envelopeSchema.safeParse(record.value.envelope);
    if (!parsed.success || parsed.data.id !== record.id) throw new Error('fileInvalidRecord');
    // The file service stamps the creator; ignore a browser-supplied author identity.
    actions.push({ ...parsed.data, author_id: await fileUserId(record.createdBy), cooperative_id: ids.coop });
  }
  const members = await Promise.all(database.users.map((user) => fileUserIdentity(user.username)));
  return { actions, members };
}

export async function saveFileRegistry(entity: string, target: string, payload: Record<string, unknown>) {
  const identity = fileIdentity();
  if (!identity || !['supplier', 'equipment'].includes(entity)) throw new Error('fileActionUnavailable');
  const envelope: Envelope = {
    id: crypto.randomUUID(),
    author_id: identity.id,
    cooperative_id: ids.coop,
    device_id: ids.device,
    config_version_id: ids.config,
    observed_at: new Date().toISOString(),
    action: 'testing_registry',
    payload: { entity, target, value: payload },
  };
  await sendFileAction(envelope);
  return { id: target };
}

export async function sendFileAction(envelope: Envelope): Promise<{ status: 'synced' | 'conflict'; error?: string }> {
  if (!fileCanWrite()) throw fileError('forbidden');
  const active = session;
  if (!active || envelope.author_id !== active.identity.id) throw fileError('invalid_credentials');
  // Retry only an append with its immutable UUID, never replacement of an old snapshot.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const database = await readFileDatabase();
    if (session !== active) throw fileError('invalid_credentials');
    const existing = database.records.find((record) => record.id === envelope.id);
    if (existing) {
      if (
        existing.createdBy !== active.user.username ||
        existing.value.kind !== 'wise-action' ||
        JSON.stringify(existing.value.envelope) !== JSON.stringify(envelope)
      )
        throw new Error('fileConflict');
      return { status: 'synced' };
    }
    const history = database.records
      .filter((r) => r.value.kind === 'wise-action')
      .map((r) => envelopeSchema.parse(r.value.envelope));
    const invalid = validateTestAction(history, envelope);
    if (invalid) return { status: 'conflict', error: invalid };
    const reply = await call({
      action: 'upsert',
      version: database.version,
      id: envelope.id,
      value: { kind: 'wise-action', envelope },
    });
    if (reply.ok) return { status: 'synced' };
    if (reply.error !== 'conflict_reload') throw fileError(reply.error);
  }
  throw new Error('fileConflict');
}
