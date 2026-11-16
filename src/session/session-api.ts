// Typed calls to the server's sign-in routes (server/http/session-routes.mjs).
// Unlike the data client these throw: a sign-in step either worked or the person sees why not.
import { request, type ApiError } from '../lib/api';
import type { Identity } from '../lib/domain';

/** One sign-in on this browser, as the server describes it. */
export interface ServerLogin {
  user: { id: string; email: string };
  /** ready: may use the app. second_factor: enter a code. second_factor_setup: add an authenticator first. */
  status: 'ready' | 'second_factor' | 'second_factor_setup';
  assurance: 'aal1' | 'aal2';
  disabled: boolean;
  expires_at: string;
}
export interface RegistrationState {
  status: 'none' | 'pending' | 'approved' | 'rejected';
  review_reason?: string | null;
}
export interface ServerProfile {
  profile: Identity | null;
  registration: RegistrationState | null;
}
export interface Unlocked {
  profile: Identity;
  offline_credential: { id: string; secret: string; expires_at: string } | null;
}
export interface Capabilities {
  registration: 'email' | 'administrator';
  passwordReset: boolean;
}

async function call<T>(path: string, body?: unknown, user: string | null = null): Promise<T> {
  const result = await request<T>(path, body, { user });
  if (result.error) throw result.error;
  return result.data;
}

export const sessionApi = {
  people: () => call<{ people: ServerLogin[] }>('/session').then((reply) => reply.people),
  capabilities: () => call<Capabilities>('/capabilities'),

  signIn: (identifier: string, password: string) =>
    call<{ login: ServerLogin }>('/session/sign-in', { identifier, password }).then((reply) => reply.login),
  beginSecondFactor: (user: string) => call<{ secret: string; uri: string }>('/session/second-factor/setup', {}, user),
  proveSecondFactor: (user: string, code: string) =>
    call<{ login: ServerLogin }>('/session/second-factor', { code }, user).then((reply) => reply.login),

  profile: (user: string) => call<ServerProfile>('/session/profile', undefined, user),
  unlock: (user: string, pin: string, deviceId: string, deviceLabel: string) =>
    call<Unlocked>('/session/unlock', { pin, device_id: deviceId, device_label: deviceLabel }, user),

  signOut: (user?: string) => call('/session/sign-out', user ? { user_id: user } : {}),
  changePassword: (user: string, current: string, next: string) => call('/session/password', { current, next }, user),

  signUp: (email: string, password: string, displayName: string) =>
    call('/session/sign-up', { email, password, display_name: displayName }),
  requestPasswordReset: (email: string) => call('/session/password-reset', { email }),
  resetPassword: (token: string, password: string) => call('/session/password-reset/confirm', { token, password }),
};

export const isApiError = (error: unknown): error is ApiError => error instanceof Error && error.name === 'ApiError';
