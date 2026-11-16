import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { URL } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const source = readFileSync(new URL('./Code.gs', import.meta.url), 'utf8');
const mode = 'username-only-v2';

function backend() {
  const properties = new Map(),
    files = new Map();
  let locked = false;
  const lock = {
    waitLock() {
      if (locked) throw new Error('busy');
      locked = true;
    },
    tryLock() {
      if (locked) return false;
      locked = true;
      return true;
    },
    releaseLock() {
      assert.equal(locked, true);
      locked = false;
    },
  };
  const context = createContext({
    console: { log() {} },
    LockService: { getScriptLock: () => lock },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (name) => properties.get(name) ?? null,
        setProperty: (name, value) => properties.set(name, value),
        deleteProperty: (name) => properties.delete(name),
      }),
    },
    Utilities: { getUuid: randomUUID },
    DriveApp: {
      Access: { PRIVATE: 'private' },
      Permission: { NONE: 'none' },
      createFile(name, content) {
        const id = randomUUID();
        const file = {
          name,
          content,
          getId: () => id,
          setSharing(access, permission) {
            file.sharing = [access, permission];
          },
          getBlob: () => ({ getDataAsString: () => file.content }),
          setContent(value) {
            file.content = value;
          },
        };
        files.set(id, file);
        return file;
      },
      getFileById: (id) => files.get(id),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({ setMimeType: () => text }),
    },
  });
  runInContext(source, context);
  context.setup();
  const file = () => files.get(properties.get('WISE_FILE_ID'));
  const state = () => JSON.parse(file().content);
  const send = (input) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(input) } }));
  const login = (username = 'alice') => send({ mode, action: 'login', username });
  const request = (input, username = 'alice') => send({ mode, username, epoch: state().epoch, ...input });
  return { context, properties, files, file, state, send, login, request, lock };
}

test('a new setup is private and empty; choosing a name creates/reopens one account without secrets', () => {
  const app = backend();
  assert.deepEqual(app.file().sharing, ['private', 'none']);
  assert.deepEqual(app.state().users, []);
  assert.deepEqual(app.state().records, []);
  assert.equal(app.login(' ALICE ').user.username, 'alice');
  assert.equal(app.login('alice').ok, true);
  assert.deepEqual(
    app.state().users.map((user) => user.username),
    ['alice'],
  );
  assert.equal(app.properties.has('WISE_TEST_USERS'), false);
  const before = app.file().content;
  app.context.setup();
  assert.equal(app.file().content, before);
});

test('first use clears legacy users and records exactly once', () => {
  const app = backend();
  app.file().setContent(JSON.stringify({ version: 17, records: [{ id: 'old', value: { name: 'old data' } }] }));
  app.properties.set('WISE_TEST_USERS', '{"tester1":{"hash":"old-secret"}}');
  const health = JSON.parse(app.context.doGet());
  assert.equal(health.mode, mode);
  assert.equal(health.ready, true);
  assert.deepEqual(app.state().users, []);
  assert.deepEqual(app.state().records, []);
  assert.equal(app.properties.has('WISE_TEST_USERS'), false);
  app.login('new person');
  app.request({ action: 'upsert', version: app.state().version, id: 'new', value: { amount: 10 } }, 'new person');
  app.context.doGet();
  assert.equal(app.state().records[0].id, 'new');
  assert.equal(app.files.size, 1);
});

test('validates names and refuses unregistered requests and public reset actions', () => {
  const app = backend();
  for (const name of ['', 'a', '../bad', '__proto__', 'x'.repeat(41)])
    assert.equal(app.login(name).error, 'invalid_username');
  assert.equal(app.request({ action: 'read' }).error, 'login_required');
  assert.equal(app.login('رنا').ok, true);
  app.login();
  assert.equal(app.request({ action: 'resetTestingData' }).error, 'unknown_action');
  assert.equal(app.send({ username: 'tester1', accessKey: 'old-key', action: 'login' }).error, 'invalid_request');
  assert.equal(JSON.parse(app.context.doPost({ postData: { contents: '{bad' } })).error, 'request_failed');
  assert.equal(app.send(null).error, 'invalid_request');
});

test('new users share changes; versions prevent overwriting another save', () => {
  const app = backend();
  app.login('alice');
  app.login('bob');
  const version = app.state().version;
  assert.equal(app.request({ action: 'upsert', version, id: 'lot1', value: { amount: 10 } }).ok, true);
  assert.equal(app.request({ action: 'read' }, 'bob').data.records[0].createdBy, 'alice');
  const before = app.file().content;
  assert.equal(
    app.request({ action: 'upsert', version, id: 'lot1', value: { amount: 99 } }, 'bob').error,
    'conflict_reload',
  );
  assert.equal(app.file().content, before);
  assert.equal(
    app.request({ action: 'upsert', version: app.state().version, id: 'lot1', value: { amount: 20 } }, 'bob').ok,
    true,
  );
  assert.equal(app.state().records[0].updatedBy, 'bob');
  assert.equal(app.request({ action: 'delete', version: app.state().version, id: 'lot1' }).ok, true);
  assert.deepEqual(app.state().records, []);
});

test('owner reset removes all users/data and rejects an old browser workspace', () => {
  const app = backend();
  const old = app.login().epoch;
  app.request({ action: 'upsert', version: app.state().version, id: 'lot1', value: {} });
  app.context.resetTestingData();
  assert.notEqual(app.state().epoch, old);
  assert.deepEqual(app.state().users, []);
  assert.deepEqual(app.state().records, []);
  app.login();
  assert.equal(
    app.request({ action: 'upsert', epoch: old, version: app.state().version, id: 'old-queued', value: {} }).error,
    'workspace_reset',
  );
  assert.deepEqual(app.state().records, []);
});

test('invalid and oversized writes and busy locks cannot change the file', () => {
  const app = backend();
  app.login();
  const before = app.file().content,
    version = app.state().version;
  assert.equal(app.request({ action: 'upsert', id: 'lot1', value: {} }).error, 'conflict_reload');
  assert.equal(app.request({ action: 'upsert', version, id: '../outside', value: {} }).error, 'invalid_record_id');
  assert.equal(app.request({ action: 'upsert', version, id: 'lot1', value: [] }).error, 'invalid_record');
  assert.equal(
    app.request({ action: 'upsert', version, id: 'lot1', value: { large: 'x'.repeat(200000) } }).error,
    'test_database_full',
  );
  app.lock.waitLock();
  assert.equal(app.request({ action: 'upsert', version, id: 'lot1', value: {} }).error, 'busy_retry_later');
  app.lock.releaseLock();
  assert.equal(app.file().content, before);
});
