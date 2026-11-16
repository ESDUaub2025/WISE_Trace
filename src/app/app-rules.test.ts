// Rules of the shared shell: who starts in which workspace, and what the status indicator says first.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canUseSimple, defaultWorkspace, preferredWorkspace, rememberWorkspace } from '../config/workspaces';
import { summarize } from './status-summary';
import type { Role } from '../lib/domain';

const person = (roles: Role[], cooperative_id = 'coop') => ({ id: 'user-1', roles, cooperative_id });

describe('workspace choice', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    });
  });

  it('starts producers in the simple workspace and everyone with oversight in the full one', () => {
    expect(defaultWorkspace(person(['producer']))).toBe('simple');
    expect(defaultWorkspace(person(['producer', 'supervisor']))).toBe('full');
    expect(defaultWorkspace(person(['manager', 'producer']))).toBe('full');
    expect(defaultWorkspace(person(['donor']))).toBe('full');
  });

  it('offers the simple workspace only to people who record production', () => {
    expect(canUseSimple(person(['supervisor']))).toBe(true);
    expect(canUseSimple(person(['admin']))).toBe(false);
    expect(canUseSimple(person(['producer'], ''))).toBe(false);
  });

  it('remembers a person’s own choice, but never puts a viewer in the simple workspace', () => {
    rememberWorkspace('user-1', 'full');
    expect(preferredWorkspace(person(['producer']))).toBe('full');
    rememberWorkspace('user-1', 'simple');
    expect(preferredWorkspace(person(['donor']))).toBe('full');
  });
});

describe('status summary', () => {
  const idle = { phase: 'idle', waiting: 0, conflicts: 0, lastSentAt: null };
  it('reports the connection before anything else', () => {
    expect(summarize('offline', { ...idle, waiting: 3 }).key).toBe('statusOfflineWaiting');
    expect(summarize('unreachable', idle).key).toBe('statusUnreachable');
  });
  it('reports waiting, failed and reviewed records while online', () => {
    expect(summarize('online', idle)).toMatchObject({ tone: 'ok', key: 'statusAllSent' });
    expect(summarize('online', { ...idle, waiting: 2 }).key).toBe('statusWaiting');
    expect(summarize('online', { ...idle, phase: 'sending', waiting: 2 }).key).toBe('statusSending');
    expect(summarize('online', { ...idle, phase: 'failed', waiting: 2 }).key).toBe('statusSendFailed');
    expect(summarize('online', { ...idle, conflicts: 1 }).key).toBe('statusConflicts');
  });
  it('warns when records have waited longer than the configured limit', () => {
    const now = Date.parse('2026-11-11T12:00:00Z');
    const waiting = { ...idle, waiting: 1 };
    expect(summarize('offline', { ...waiting, lastSentAt: '2026-11-10T11:00:00Z' }, now).stale).toBe(true);
    expect(summarize('offline', { ...waiting, lastSentAt: '2026-11-11T11:00:00Z' }, now).stale).toBe(false);
  });
});
