// Integration test: a real PostgreSQL database, the real HTTP app, real cookies.
// Needs the local database (npm run db:start). Each run uses its own throwaway database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { Blob } from 'node:buffer';
import { migrate } from '../migrate.mjs';
import { createApp } from '../app.mjs';
import { identifier } from '../database.mjs';
import { mediaPath } from '../storage.mjs';
import { codeAt, createSecretBox, currentStep } from '../auth/totp.mjs';
import { authPolicy } from '../auth/policy.mjs';

const origin = 'http://localhost:3000';
const secret = 'local-test-secret-with-more-than-32-characters';
const password = 'test-password-123456';

test('reject SQL and filesystem injection', () => {
  for (const value of ['membership;drop table lot', 'private.user_pin', '"lot"', 'lot()'])
    assert.throws(() => identifier(value));
  for (const value of ['../../secrets', 'x/../y', '/etc/passwd'])
    assert.throws(() => mediaPath('/tmp/media', 'evidence', value));
});

test('standalone PostgreSQL, real HTTP authentication and permissions', { timeout: 180000 }, async (t) => {
  const adminUrl =
    process.env.TEST_DATABASE_URL ?? 'postgres://postgres:wise-local-integration-only@127.0.0.1:55579/wise';
  const maintenance = new Pool({ connectionString: adminUrl });
  const name = `wise_test_${randomUUID().replaceAll('-', '')}`;
  await maintenance.query(`create database ${identifier(name)}`);
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: String(url) });
  const mediaRoot = await mkdtemp(join(tmpdir(), 'wise-test-'));
  let app;
  t.after(async () => {
    if (app) await app.close();
    await pool.end();
    await maintenance.query(`drop database ${identifier(name)} with(force)`);
    await maintenance.end();
    await rm(mediaRoot, { recursive: true, force: true });
  });

  await migrate(pool);
  await migrate(pool); // applying twice must be harmless

  await t.test('empty installation has all migrations and no generated records', async () => {
    assert.equal((await pool.query('select count(*)::int as n from wise_auth.migration')).rows[0].n, 94);
    assert.equal((await pool.query('select count(*)::int as n from public.lot')).rows[0].n, 0);
    assert.equal((await pool.query('select count(*)::int as n from public.membership')).rows[0].n, 0);
    assert.equal(
      (await pool.query("select count(*)::int as n from pg_extension where extname in ('pg_cron','pg_net')")).rows[0].n,
      0,
    );
  });

  app = await createApp({ connectionString: String(url), origin, secret, mediaRoot, allowLocalSignUp: true });
  const send = (target, method, path, body, { cookie = '', actingUser } = {}) =>
    target.inject({
      method,
      url: path,
      headers: {
        origin,
        cookie,
        ...(actingUser ? { 'x-wise-user': actingUser } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      payload: body,
    });
  const post = (path, body, options) => send(app, 'POST', path, body, options);
  const get = (path, options) => send(app, 'GET', path, undefined, options);
  const cookieFrom = (response) => String([].concat(response.headers['set-cookie'] ?? [])[0] ?? '').split(';')[0];
  const signIn = async (identifier_, secretPassword = password, options) => {
    const response = await post('/api/session/sign-in', { identifier: identifier_, password: secretPassword }, options);
    return { response, cookie: cookieFrom(response) || options?.cookie || '' };
  };

  /** A member with a password and PIN, created the way the administration function does it. */
  async function member(username, roles, cooperative) {
    const account = await app.authentication.accounts.create({
      username,
      password,
      displayName: username,
      confirmed: true,
    });
    await app.database.rpc({ service: true }, 'provision_membership', {
      target: account.id,
      coop: cooperative,
      username,
      display_name: `Test ${username}`,
      roles,
      authorizations: {},
      pin: '2468',
      actor: account.id,
    });
    return account.id;
  }

  let cookie = '';
  let visitor;

  await t.test('origin protection and anonymous restrictions', async () => {
    assert.equal((await app.inject({ method: 'POST', url: '/api/query', payload: { table: 'lot' } })).statusCode, 403);
    assert.equal((await post('/api/query', { table: 'lot' })).statusCode, 401);
    assert.equal((await post('/api/rpc/bootstrap_installation', {})).statusCode, 400);
    const publicView = await post('/api/rpc/public_lot_view', { token: 'unknown' });
    assert.equal(publicView.statusCode, 200, publicView.body);
    assert.equal(publicView.json().data.status, 'unavailable');
    assert.deepEqual((await get('/api/session')).json(), { people: [] });
  });

  await t.test(
    'self-registration: email must be verified; sign-in sets an HttpOnly cookie and leaks no secret',
    async () => {
      const signup = await post('/api/session/sign-up', {
        email: 'Tester@Example.test',
        password,
        display_name: 'Test user',
      });
      assert.equal(signup.statusCode, 200, signup.body);
      // The same answer for an address that already exists (no account enumeration).
      assert.equal((await post('/api/session/sign-up', { email: 'tester@example.test', password })).statusCode, 200);
      assert.equal((await pool.query('select count(*)::int as n from wise_auth.users')).rows[0].n, 1);

      assert.equal((await signIn('tester@example.test')).response.statusCode, 403);
      assert.equal((await signIn('tester@example.test', 'wrong-password-123')).response.json().error, 'authFailed');
      assert.equal((await signIn('nobody@example.test')).response.json().error, 'authFailed');
      await pool.query('update wise_auth.users set email_confirmed_at=now()');

      const login = await signIn('tester@example.test');
      assert.equal(login.response.statusCode, 200, login.response.body);
      assert.match(String(login.response.headers['set-cookie']), /HttpOnly; SameSite=Lax/);
      assert.equal(login.response.json().login.status, 'ready');
      cookie = login.cookie;
      visitor = login.response.json().login.user.id;
      const session = (await get('/api/session', { cookie })).json();
      assert.equal(session.people[0].user.id, visitor);
      assert.equal(session.people[0].assurance, 'aal1');
      const stored = (await pool.query('select token_hash from wise_auth.device_session')).rows[0].token_hash;
      assert.equal(cookie.includes(stored), false, 'only a hash of the cookie is stored');
      assert.deepEqual((await get('/api/session/profile', { cookie })).json(), {
        profile: null,
        registration: { status: 'none' },
      });
    },
  );

  await t.test('registration is pending and cannot self-approve', async () => {
    await pool.query(
      "create function public.transport_json_array(payload jsonb) returns jsonb language sql as 'select payload';grant execute on function public.transport_json_array(jsonb) to authenticated",
    );
    const array = [{ action: 'trace_completed', quantity: 0 }];
    const echoed = await post('/api/rpc/transport_json_array', { payload: array }, { cookie });
    assert.deepEqual(echoed.json().data, array);
    const registration = await post(
      '/api/rpc/request_registration',
      {
        account_username: 'testuser',
        account_name: 'Test User',
        workspace_name: 'Test Workspace',
        workspace_region: 'Lebanon',
        account_pin: '2468',
        requested_plan: 'trial',
      },
      { cookie },
    );
    assert.equal(registration.statusCode, 200, registration.body);
    assert.equal((await get('/api/session/profile', { cookie })).json().registration.status, 'pending');
    const unlock = await post('/api/session/unlock', { pin: '2468', device_id: randomUUID() }, { cookie });
    assert.equal(unlock.statusCode, 409);
    assert.equal(unlock.json().error, 'registrationPending');
    const review = await post(
      '/api/rpc/review_registration',
      { target: visitor, outcome: 'approved', plan: 'full', reason: 'Self approval' },
      { cookie },
    );
    assert.match(review.body, /Admin AAL2/);
    assert.deepEqual((await post('/api/query', { table: 'lot' }, { cookie })).json().data, []);
    assert.equal((await post('/api/query', { table: 'wise_auth.users' }, { cookie })).statusCode, 400);
    assert.equal(
      (await post('/api/query', { table: 'lot', update: { state: 'released' } }, { cookie })).statusCode,
      400,
    );
    assert.equal(
      (await post('/api/rpc/snapshot_checkpoint', {}, { cookie, actingUser: randomUUID() })).statusCode,
      401,
      'acting as someone not signed in here is refused',
    );
  });

  const cooperative = randomUUID();
  let admin, producer;

  await t.test('administrators must add and prove an authenticator before any data access', async () => {
    await pool.query(
      "insert into public.cooperative(id,code,name,region) values($1,'HTTPTEST','HTTP test workspace','Test')",
      [cooperative],
    );
    admin = await member('boss', ['admin'], cooperative);
    const login = await signIn('boss');
    assert.equal(login.response.json().login.status, 'second_factor_setup');
    const adminCookie = login.cookie;
    const blocked = await post('/api/query', { table: 'cooperative' }, { cookie: adminCookie });
    assert.equal(blocked.json().error, 'secondFactorRequired');

    const setup = await post('/api/session/second-factor/setup', {}, { cookie: adminCookie });
    assert.equal(setup.statusCode, 200, setup.body);
    const totpSecret = setup.json().secret;
    assert.equal(
      (
        await pool.query('select totp_secret from wise_auth.credential where user_id=$1', [admin])
      ).rows[0].totp_secret.includes(totpSecret),
      false,
      'secret is sealed at rest',
    );
    assert.equal(
      (await post('/api/session/second-factor', { code: '000000' }, { cookie: adminCookie })).json().error,
      'codeFailed',
    );
    const code = codeAt(totpSecret, currentStep());
    const proved = await post('/api/session/second-factor', { code }, { cookie: adminCookie });
    assert.equal(proved.json().login.status, 'ready', proved.body);
    assert.equal(proved.json().login.assurance, 'aal2');
    assert.equal(
      (await post('/api/session/second-factor', { code }, { cookie: adminCookie })).json().error,
      'codeFailed',
      'a code works once',
    );
    assert.equal((await post('/api/query', { table: 'cooperative' }, { cookie: adminCookie })).statusCode, 200);
    assert.equal(
      (await post('/api/session/second-factor/setup', {}, { cookie: adminCookie })).json().error,
      'secondFactorAlreadySet',
    );

    // The next sign-in asks for a code again and grants nothing until it is given.
    const again = await signIn('boss');
    assert.equal(again.response.json().login.status, 'second_factor');
    assert.equal(
      (await post('/api/query', { table: 'cooperative' }, { cookie: again.cookie })).json().error,
      'secondFactorRequired',
    );
    const lifetime = (
      await pool.query(
        'select expires_at - signed_in_at as life from wise_auth.device_login where user_id=$1 order by signed_in_at desc',
        [admin],
      )
    ).rows[0].life;
    assert.equal(lifetime.hours, authPolicy.login.privilegedMs / 3600000, 'privileged sign-ins are short-lived');
  });

  await t.test('shared phone: two people on one cookie, PIN unlock, per-person sign-out', async () => {
    producer = await member('operator', ['producer'], cooperative);
    const second = await member('helper', ['producer'], cooperative);
    const first = await signIn('operator');
    const both = await signIn('helper', password, { cookie: first.cookie });
    const shared = both.cookie;
    assert.notEqual(shared, first.cookie, 'the cookie value changes at each password sign-in');
    assert.equal(
      (await get('/api/session', { cookie: first.cookie })).json().people.length,
      0,
      'the old cookie value is dead',
    );
    assert.equal((await get('/api/session', { cookie: shared })).json().people.length, 2);

    assert.equal(
      (await post('/api/query', { table: 'cooperative' }, { cookie: shared })).json().error,
      'sessionChanged',
      'with two people the app must say who is acting',
    );
    const own = await post(
      '/api/query',
      { table: 'membership', filters: [{ column: 'user_id', op: 'eq', value: producer }] },
      { cookie: shared, actingUser: producer },
    );
    assert.equal(own.json().data[0].username, 'operator');

    const device = randomUUID();
    assert.equal(
      (
        await post(
          '/api/session/unlock',
          { pin: '0000', device_id: device, device_label: 'Coop phone' },
          { cookie: shared, actingUser: producer },
        )
      ).json().error,
      'pinFailed',
    );
    const unlocked = await post(
      '/api/session/unlock',
      { pin: '2468', device_id: device, device_label: 'Coop phone' },
      { cookie: shared, actingUser: producer },
    );
    assert.equal(unlocked.statusCode, 200, unlocked.body);
    assert.equal(unlocked.json().profile.username, 'operator');
    assert.equal(
      unlocked.json().offline_credential,
      null,
      'no offline whey credential without the receiving authorization',
    );
    assert.equal(
      (await pool.query('select label from public.device where id=$1', [device])).rows[0].label,
      'Coop phone',
    );

    await post('/api/session/sign-out', { user_id: second }, { cookie: shared });
    const left = (await get('/api/session', { cookie: shared })).json().people;
    assert.deepEqual(
      left.map((person) => person.user.id),
      [producer],
    );
    const cleared = await post('/api/session/sign-out', {}, { cookie: shared });
    assert.match(String(cleared.headers['set-cookie']), /Max-Age=0/);
    assert.equal((await get('/api/session', { cookie: shared })).json().people.length, 0);
  });

  await t.test('repeated wrong passwords pause the account; an administrator reset restores access', async () => {
    for (let attempt = 0; attempt < authPolicy.lockout.maxFailures; attempt += 1) {
      assert.equal((await signIn('operator', 'wrong-password-123')).response.statusCode, 401);
    }
    const paused = await signIn('operator');
    assert.equal(paused.response.statusCode, 429);
    assert.equal(paused.response.json().error, 'tooManyAttempts');

    const boss = await signIn('boss');
    // Read the administrator's authenticator secret the way the server does, to produce a fresh code.
    await pool.query('update wise_auth.credential set totp_last_step=null where user_id=$1', [admin]);
    const sealed = (await pool.query('select totp_secret from wise_auth.credential where user_id=$1', [admin])).rows[0]
      .totp_secret;
    const code = codeAt(createSecretBox(secret).open(sealed), currentStep());
    assert.equal((await post('/api/session/second-factor', { code }, { cookie: boss.cookie })).statusCode, 200);

    const tooShort = await post(
      '/api/functions/user-admin',
      { action: 'reset_access', user_id: producer, password: 'short' },
      { cookie: boss.cookie },
    );
    assert.equal(tooShort.statusCode, 400);
    const reset = await post(
      '/api/functions/user-admin',
      { action: 'reset_access', user_id: producer, password: 'a-new-password-987', pin: '1357' },
      { cookie: boss.cookie },
    );
    assert.equal(reset.statusCode, 200, reset.body);
    assert.equal((await signIn('operator')).response.statusCode, 401, 'the old password no longer works');
    const fresh = await signIn('operator', 'a-new-password-987');
    assert.equal(fresh.response.statusCode, 200, fresh.response.body);
    assert.equal(
      (await post('/api/session/unlock', { pin: '2468', device_id: randomUUID() }, { cookie: fresh.cookie })).json()
        .error,
      'pinFailed',
    );
    assert.equal(
      (await post('/api/session/unlock', { pin: '1357', device_id: randomUUID() }, { cookie: fresh.cookie }))
        .statusCode,
      200,
    );

    // A producer cannot reset anyone, and a new member can be created by the administrator.
    assert.equal(
      (
        await post(
          '/api/functions/user-admin',
          { action: 'reset_access', user_id: admin, pin: '9999' },
          { cookie: fresh.cookie },
        )
      ).statusCode,
      403,
    );
    const created = await post(
      '/api/functions/user-admin',
      {
        username: 'newhand',
        password: 'another-password-1',
        pin: '4321',
        display_name: 'New hand',
        cooperative_id: cooperative,
        roles: ['producer'],
      },
      { cookie: boss.cookie },
    );
    assert.equal(created.statusCode, 200, created.body);
    assert.equal((await signIn('newhand', 'another-password-1')).response.statusCode, 200);

    // Changing your own password keeps this device signed in and ends the others.
    const other = await signIn('operator', 'a-new-password-987');
    const changed = await post(
      '/api/session/password',
      { current: 'a-new-password-987', next: 'my-own-password-555' },
      { cookie: fresh.cookie },
    );
    assert.equal(changed.statusCode, 200, changed.body);
    assert.equal((await get('/api/session', { cookie: fresh.cookie })).json().people.length, 1);
    assert.equal((await get('/api/session', { cookie: other.cookie })).json().people.length, 0);
  });

  await t.test('restricted runtime role can sign in, store private evidence, and respects disablement', async () => {
    const role = 'wise_runtime_' + randomUUID().replaceAll('-', '');
    await maintenance.query(
      `create role ${identifier(role)} login password 'local-restricted-test-only' nosuperuser nocreatedb nocreaterole inherit`,
    );
    await pool.query(`grant anon,authenticated,service_role to ${identifier(role)}`);
    const runtimeUrl = new URL(url);
    runtimeUrl.username = role;
    runtimeUrl.password = 'local-restricted-test-only';
    let runtime;
    try {
      runtime = await createApp({ connectionString: String(runtimeUrl), origin, secret, mediaRoot, testMode: true });
      const login = await send(runtime, 'POST', '/api/session/sign-in', {
        identifier: 'operator',
        password: 'my-own-password-555',
      });
      assert.equal(login.statusCode, 200, login.body);
      const runtimeCookie = cookieFrom(login);
      const result = await send(runtime, 'POST', '/api/query', { table: 'cooperative' }, { cookie: runtimeCookie });
      assert.equal(result.json().data.length, 1, result.body);
      // Roles are still visible to the sign-in service under the restricted login, so administrators are challenged.
      const challenged = await send(runtime, 'POST', '/api/session/sign-in', { identifier: 'boss', password });
      assert.equal(challenged.json().login?.status, 'second_factor', challenged.body);

      const path = `${cooperative}/${randomUUID()}.jpg`;
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array([255, 216, 255, 217])], { type: 'image/jpeg' }));
      const upload = new Request(origin, { method: 'POST', body: form });
      const uploaded = await runtime.inject({
        method: 'POST',
        url: '/api/media/evidence/' + path,
        headers: { origin, cookie: runtimeCookie, 'content-type': upload.headers.get('content-type') },
        payload: Buffer.from(await upload.arrayBuffer()),
      });
      assert.equal(uploaded.statusCode, 200, uploaded.body);
      const link = await send(
        runtime,
        'POST',
        '/api/media-link/evidence/' + path,
        { expiresIn: 180 },
        { cookie: runtimeCookie },
      );
      const signed = new URL(link.json().data.signedUrl);
      assert.equal((await runtime.inject({ url: signed.pathname + signed.search })).statusCode, 200);

      await pool.query("update public.membership set status='disabled' where user_id=$1", [producer]);
      assert.equal(
        (await send(runtime, 'GET', '/api/session', undefined, { cookie: runtimeCookie })).json().people[0].disabled,
        true,
      );
      const denied = await send(runtime, 'POST', '/api/query', { table: 'lot' }, { cookie: runtimeCookie });
      assert.equal(denied.json().error, 'accountDisabled');
      assert.equal(
        (
          await send(runtime, 'POST', '/api/session/sign-in', {
            identifier: 'operator',
            password: 'my-own-password-555',
          })
        ).json().error,
        'accountDisabled',
      );
    } finally {
      if (runtime) await runtime.close();
      await pool.query(`drop owned by ${identifier(role)}`);
      await maintenance.query(`drop role ${identifier(role)}`);
    }
  });
});
