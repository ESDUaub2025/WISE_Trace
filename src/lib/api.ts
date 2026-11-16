/* eslint-disable @typescript-eslint/no-explicit-any -- Database functions return heterogeneous, runtime-validated records. */
// The one place the app talks to the WISE server.
//   api.from(table)        read rows the signed-in person may see
//   api.rpc(name, args)    call a database function
//   api.functions.invoke   run a server operation (sync, reports, administration)
//   api.storage            private photos and training media
// Sign-in calls are in src/session/session-api.ts. Every call returns { data, error } and never throws.
import { connectivity } from '../connectivity/connectivity';
import { fileTesting, saveFileRegistry } from '../testing/file-backend';

export const demo = import.meta.env.VITE_DEMO_MODE === 'true';
export const apiBase = import.meta.env.VITE_API_URL ?? '/api';

export interface Result<T = any> {
  data: T;
  error: ApiError | null;
}

/** A failed call. `message` is a code the translations know (src/i18n) or the server's own sentence. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
  /** True when the request never reached the server. */
  get network() {
    return this.status === 0;
  }
}

// With several people signed in on one phone, the server needs to know who is acting.
// The session module sets this whenever a person unlocks or locks the app.
let actingUser: string | null = null;
export function setActingUser(id: string | null) {
  actingUser = id;
}
export const getActingUser = () => actingUser;

/** The header that names the acting person, for calls that cannot go through request(). */
export function actingHeaders(user: string | null = actingUser): Record<string, string> {
  return user ? { 'X-Wise-User': user } : {};
}

export async function request<T = any>(
  path: string,
  body?: unknown,
  options: { user?: string | null } = {},
): Promise<Result<T>> {
  if (fileTesting) {
    if (path === '/rpc/manage_registry' && body && typeof body === 'object') {
      const input = body as { entity: string; target: string; payload: Record<string, unknown> };
      try {
        return { data: (await saveFileRegistry(input.entity, input.target, input.payload)) as T, error: null };
      } catch (error) {
        return {
          data: null as T,
          error: new ApiError(error instanceof Error ? error.message : 'fileRequestFailed', 400),
        };
      }
    }
    return { data: null as T, error: new ApiError('fileActionUnavailable', 400) };
  }
  const user = options.user === undefined ? actingUser : options.user;
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...actingHeaders(user) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    connectivity.reportFailure();
    return { data: null as T, error: new ApiError('serverUnreachable') };
  }
  connectivity.reportReached();
  try {
    const value = await response.json();
    if (!response.ok) {
      const { error, message, ...details } = value ?? {};
      return { data: null as T, error: new ApiError(error ?? message ?? 'Request failed', response.status, details) };
    }
    return { data: (Object.hasOwn(value, 'data') ? value.data : value) as T, error: null };
  } catch {
    return { data: null as T, error: new ApiError('Request failed', response.status) };
  }
}

/**
 * A client bound to one person. The default client follows whoever is active;
 * long downloads pin the person they started for, so a switch mid-download cannot mix two people's data.
 */
export function createApiClient(pinnedUser?: string) {
  const options = pinnedUser ? { user: pinnedUser } : {};
  const call = <T = any>(path: string, body?: unknown) => request<T>(path, body, options);
  const headers = () => actingHeaders(pinnedUser ?? actingUser);

  return {
    rpc: (name: string, args?: Record<string, unknown>) => call(`/rpc/${encodeURIComponent(name)}`, args ?? {}),

    from(table: string) {
      const input: { table: string; columns: string; filters: any[]; order: any[]; offset?: number; limit?: number } = {
        table,
        columns: '*',
        filters: [],
        order: [],
      };
      let mode = '';
      const builder = {
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
        in(column: string, value: unknown[]) {
          input.filters.push({ column, op: 'in', value });
          return builder;
        },
        order(column: string, options: { ascending?: boolean } = {}) {
          input.order.push({ column, ...options });
          return builder;
        },
        range(from: number, to: number) {
          input.offset = from;
          input.limit = to - from + 1;
          return builder;
        },
        limit(limit: number) {
          input.limit = limit;
          return builder;
        },
        /** Exactly one row, otherwise an error. */
        single() {
          mode = 'single';
          return builder;
        },
        /** One row or null. */
        maybeSingle() {
          mode = 'maybe';
          return builder;
        },
        then<TResult1 = Result, TResult2 = never>(
          onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
        ): Promise<TResult1 | TResult2> {
          return call('/query', input)
            .then((result): Result => {
              if (!mode || result.error) return result;
              const rows = result.data;
              if (rows.length > 1 || (mode === 'single' && !rows.length))
                return { data: null, error: new ApiError('Expected one record') };
              return { data: rows[0] ?? null, error: null };
            })
            .then(onfulfilled, onrejected);
        },
      };
      return builder;
    },

    functions: { invoke: (name: string, { body }: { body: unknown }) => call(`/functions/${name}`, body) },

    storage: {
      from(bucket: string) {
        return {
          async upload(path: string, blob: Blob, _options?: unknown): Promise<Result> {
            if (fileTesting) return { data: null, error: new ApiError('filePhotosUnavailable', 400) };
            void _options;
            try {
              const form = new FormData();
              form.append('file', blob);
              const response = await fetch(`${apiBase}/media/${bucket}/${path}`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: headers(),
                body: form,
              });
              const result = await response.json();
              if (!response.ok) return { data: null, error: new ApiError(result.error, response.status) };
              return { data: result.data, error: null };
            } catch {
              return { data: null, error: new ApiError('serverUnreachable') };
            }
          },
          async download(path: string) {
            if (fileTesting)
              return { data: null as unknown as Blob, error: new ApiError('filePhotosUnavailable', 400) };
            try {
              const response = await fetch(`${apiBase}/media/${bucket}/${path}`, {
                credentials: 'same-origin',
                headers: headers(),
              });
              if (!response.ok) throw new Error('Media unavailable');
              return { data: await response.blob(), error: null };
            } catch (error) {
              return { data: null as unknown as Blob, error: error as Error };
            }
          },
          createSignedUrl: (path: string, expiresIn: number) => call(`/media-link/${bucket}/${path}`, { expiresIn }),
        };
      },
    },
  };
}

/** Null in the demo build, which has no server. */
export const api = demo ? null : createApiClient();
