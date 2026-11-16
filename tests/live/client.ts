/* eslint-disable @typescript-eslint/no-explicit-any -- Test driver for heterogeneous SQL responses. */
import { request, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
// @ts-expect-error The server's password hashing is native Node ESM.
import { hashPassword } from '../../server/auth/passwords.mjs';
// @ts-expect-error The production database adapter is native Node ESM.
import { createDatabase, scopedClient, identifier } from '../../server/database.mjs';
const origin = 'http://127.0.0.1:5173';
export const api = origin + '/api';
export function client(existing?: APIRequestContext) {
  const context = existing
    ? Promise.resolve(existing)
    : request.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin } });
  let password = 'wise-demo-only';
  let acting = '';
  async function call(path: string, body?: unknown) {
    try {
      const ctx = await context;
      const response = await ctx.fetch('/api' + path, {
        method: body === undefined ? 'GET' : 'POST',
        data: body,
        headers: { Origin: origin, ...(acting ? { 'X-Wise-User': acting } : {}) },
      });
      const result = await response.json();
      if (!response.ok()) throw new Error(result.error ?? result.message ?? 'Request failed');
      return { data: result.data ?? result, error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  }
  const c: any = {
    rpc: (name: string, args: unknown = {}) => call('/rpc/' + name, args),
    from(table: string) {
      const input: any = { table, filters: [], order: [] };
      let mode = '';
      const builder: any = {
        select(columns = '*') {
          input.columns = columns;
          return builder;
        },
        eq(column: string, value: unknown) {
          input.filters.push({ column, op: 'eq', value });
          return builder;
        },
        ilike(column: string, value: unknown) {
          input.filters.push({ column, op: 'ilike', value });
          return builder;
        },
        is(column: string, value: unknown) {
          input.filters.push({ column, op: 'is', value });
          return builder;
        },
        in(column: string, value: unknown) {
          input.filters.push({ column, op: 'in', value });
          return builder;
        },
        order(column: string, options = {}) {
          input.order.push({ column, ...options });
          return builder;
        },
        limit(limit: number) {
          input.limit = limit;
          return builder;
        },
        single() {
          mode = 'single';
          return builder;
        },
        maybeSingle() {
          mode = 'maybe';
          return builder;
        },
        then(resolve: any, reject: any) {
          return call('/query', input)
            .then((result) => {
              if (mode && !result.error)
                return {
                  data: result.data[0] ?? null,
                  error: mode === 'single' && result.data.length !== 1 ? new Error('Expected one record') : null,
                };
              return result;
            })
            .then(resolve, reject);
        },
      };
      return builder;
    },
    functions: { invoke: (name: string, { body }: { body: unknown }) => call('/functions/' + name, body) },
    storage: {
      from(bucket: string) {
        return {
          async download(path: string) {
            try {
              const response = await (await context).get('/api/media/' + bucket + '/' + path);
              if (!response.ok()) throw new Error('Media unavailable');
              return { data: new Blob([new Uint8Array(await response.body())]), error: null };
            } catch (error) {
              return { data: null, error };
            }
          },
        };
      },
    },
    /** Sign-in the way the app does it: password, then the acting person on every later call. */
    session: {
      async signIn(username: string, secret = password) {
        password = secret;
        const result = await call('/session/sign-in', { identifier: username, password: secret });
        if (!result.error) acting = result.data.login.user.id;
        return {
          data: result.data?.login as { user: { id: string }; status: string; assurance: string } | null,
          error: result.error,
        };
      },
      people: () => call('/session'),
      signOut: () => call('/session/sign-out', {}),
      async assurance() {
        const people = await call('/session');
        const list = (people.data?.people ?? []) as any[];
        return (list.find((person) => person.user.id === acting) ?? list[0])?.assurance as string | undefined;
      },
    },
  };
  return c;
}
const database = createDatabase(
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:wise-local-integration-only@127.0.0.1:55579/wise',
);
/** Local fixtures only: removes a person's authenticator so the next sign-in sets up a fresh one. */
export async function resetMfa(username: string) {
  if (
    !['localhost', '127.0.0.1'].includes(new URL(process.env.TEST_DATABASE_URL ?? 'postgres://127.0.0.1/wise').hostname)
  )
    throw new Error('MFA fixture reset is local only');
  await database.pool.query(
    `update wise_auth.credential set totp_secret=null, totp_confirmed_at=null, totp_last_step=null, failed_attempts=0, blocked_until=null
      where user_id=(select user_id from public.membership where username=$1)`,
    [username],
  );
}
export function serviceClient() {
  const c: any = scopedClient(database, { service: true });
  const original = c.from.bind(c);
  c.from = (table: string) => {
    const builder = original(table);
    builder.insert = async (row: Record<string, unknown>) => {
      try {
        const names = Object.keys(row);
        const params = names.map((name) =>
          typeof row[name] === 'object' && row[name] !== null ? JSON.stringify(row[name]) : row[name],
        );
        await database.pool.query(
          `insert into public.${identifier(table)}(${names.map(identifier).join(',')}) values(${names.map((_, i) => '$' + (i + 1)).join(',')})`,
          params,
        );
        return { error: null };
      } catch (error) {
        return { error };
      }
    };
    return builder;
  };
  /** Creates a sign-in identity without a membership, as the administration function does before provisioning. */
  c.createAccount = async (username: string, password: string) => {
    const id = randomUUID();
    await database.pool.query('insert into wise_auth.users(id,email,email_confirmed_at) values($1,$2,now())', [
      id,
      `${username}@users.wise.invalid`,
    ]);
    await database.pool.query('insert into wise_auth.credential(user_id,password_hash) values($1,$2)', [
      id,
      await hashPassword(password),
    ]);
    return id;
  };
  return c;
}
export async function confirmEmail(email: string) {
  await database.pool.query('update wise_auth.users set email_confirmed_at=now() where email=$1', [email]);
}
