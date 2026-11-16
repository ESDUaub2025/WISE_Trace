// TEMPORARY OPEN TESTING: anyone can create/use any username. No passwords or keys.
// Replace the deployed Code.gs and deploy a New version using the same /exec URL.
// First use clears the old keyed tester accounts and records ONCE.
const OPEN_TEST_MODE = 'username-only-v2';

function setup() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    openDatabase_();
    console.log('Ready. Users choose a username on the website. No access keys are needed.');
  } finally {
    lock.releaseLock();
  }
}

// Owner-only editor function. This action is never exposed by doPost.
function resetTestingData() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const database = openDatabase_();
    database.file.setContent(JSON.stringify(emptyDatabase_()));
    console.log('All test users and records cleared. Open browser sessions must reconnect.');
  } finally {
    lock.releaseLock();
  }
}

function emptyDatabase_() {
  return { mode: OPEN_TEST_MODE, epoch: Utilities.getUuid(), version: 0, users: [], records: [] };
}

function openDatabase_() {
  const properties = PropertiesService.getScriptProperties();
  let id = properties.getProperty('WISE_FILE_ID');
  if (!id) {
    const file = DriveApp.createFile('wise-test-database.json', JSON.stringify(emptyDatabase_()), 'application/json');
    file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
    id = file.getId();
    properties.setProperty('WISE_FILE_ID', id);
  }
  const file = DriveApp.getFileById(id);
  let state = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  // Authorized migration from the old test-only file. Never merge old people/data.
  if (state.mode !== OPEN_TEST_MODE) {
    if (!Array.isArray(state.records) || !Number.isInteger(state.version)) throw new Error('Unexpected test file');
    state = emptyDatabase_();
    file.setContent(JSON.stringify(state));
  }
  properties.deleteProperty('WISE_TEST_USERS');
  return { file, state };
}

function doGet() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return json_({ ok: false, error: 'busy_retry_later' });
  try {
    openDatabase_();
    return json_({ ok: true, service: 'WISE test file backend', ready: true, mode: OPEN_TEST_MODE });
  } catch (error) {
    return json_({ ok: false, error: 'request_failed' });
  } finally {
    lock.releaseLock();
  }
}

function doPost(event) {
  try {
    const body = event && event.postData && event.postData.contents;
    if (!body || body.length > 240000) return json_({ ok: false, error: 'invalid_request' });
    const input = JSON.parse(body);
    if (!input || typeof input !== 'object' || Array.isArray(input) || input.mode !== OPEN_TEST_MODE)
      return json_({ ok: false, error: 'invalid_request' });
    if (['login', 'read', 'upsert', 'delete'].indexOf(input.action) === -1)
      return json_({ ok: false, error: 'unknown_action' });
    const username =
      typeof input.username === 'string'
        ? input.username.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
        : '';
    if (!/^[\p{L}\p{N}][\p{L}\p{N}\p{M}_. -]{1,39}$/u.test(username))
      return json_({ ok: false, error: 'invalid_username' });
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return json_({ ok: false, error: 'busy_retry_later' });
    try {
      const database = openDatabase_(),
        state = database.state,
        file = database.file;
      let user = state.users.find(function (person) {
        return person.username === username;
      });
      if (input.action === 'login') {
        if (!user) {
          if (state.users.length >= 100) return json_({ ok: false, error: 'test_database_full' });
          user = { username, createdAt: new Date().toISOString() };
          state.users.push(user);
          state.version += 1;
          if (!write_(file, state)) return json_({ ok: false, error: 'test_database_full' });
        }
        return json_({ ok: true, mode: OPEN_TEST_MODE, epoch: state.epoch, user: { username, canWrite: true } });
      }
      if (!user) return json_({ ok: false, error: 'login_required' });
      if (input.epoch !== state.epoch) return json_({ ok: false, error: 'workspace_reset' });
      if (input.action === 'read') return json_({ ok: true, data: state });
      if (!Number.isInteger(input.version) || input.version !== state.version)
        return json_({ ok: false, error: 'conflict_reload', version: state.version });
      if (typeof input.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(input.id))
        return json_({ ok: false, error: 'invalid_record_id' });
      const index = state.records.findIndex(function (record) {
        return record.id === input.id;
      });
      if (input.action === 'delete') {
        if (index === -1) return json_({ ok: false, error: 'record_not_found' });
        state.records.splice(index, 1);
      } else {
        if (!input.value || typeof input.value !== 'object' || Array.isArray(input.value))
          return json_({ ok: false, error: 'invalid_record' });
        const record = {
          id: input.id,
          value: input.value,
          createdBy: index === -1 ? username : state.records[index].createdBy,
          updatedBy: username,
          updatedAt: new Date().toISOString(),
        };
        if (index === -1) state.records.push(record);
        else state.records[index] = record;
      }
      state.version += 1;
      state.updatedBy = username;
      state.updatedAt = new Date().toISOString();
      if (!write_(file, state)) return json_({ ok: false, error: 'test_database_full' });
      return json_({ ok: true, version: state.version });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return json_({ ok: false, error: 'request_failed' });
  }
}

function write_(file, state) {
  const serialized = JSON.stringify(state);
  if (serialized.length > 200000) return false;
  file.setContent(serialized);
  return true;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
