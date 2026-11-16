// The app has two workspaces over the same account, records and sync:
//   simple  one next step at a time, for recording production on a phone      (/today)
//   full    every list, review, dashboard, report and setting                  (/)
// This file decides who starts where. Anyone allowed in both can switch at any time; the choice is remembered per person.
import type { Identity, Role } from '../lib/domain';

export type Workspace = 'simple' | 'full';

export const workspaceConfig = {
  simplePath: '/today',
  fullPath: '/',
  /** Roles that record production. Only they are offered the simple workspace. */
  simpleRoles: ['producer', 'supervisor'] as Role[],
  /** Holding any of these means the person's main job is oversight, so they start in the full workspace. */
  fullFirstRoles: ['supervisor', 'manager', 'admin', 'food_safety', 'partner', 'donor'] as Role[],
} as const;

const preferenceKey = (id: string) => `wise-workspace:${id}`;

export function canUseSimple(identity: Pick<Identity, 'roles' | 'cooperative_id'>) {
  return Boolean(identity.cooperative_id) && identity.roles.some((role) => workspaceConfig.simpleRoles.includes(role));
}

export function defaultWorkspace(identity: Pick<Identity, 'roles' | 'cooperative_id'>): Workspace {
  if (!canUseSimple(identity)) return 'full';
  return identity.roles.some((role) => workspaceConfig.fullFirstRoles.includes(role)) ? 'full' : 'simple';
}

/** The workspace a person last chose on this device, falling back to the default for their roles. */
export function preferredWorkspace(identity: Pick<Identity, 'id' | 'roles' | 'cooperative_id'>): Workspace {
  if (!canUseSimple(identity)) return 'full';
  try {
    const stored = localStorage.getItem(preferenceKey(identity.id));
    if (stored === 'simple' || stored === 'full') return stored;
  } catch {
    /* storage unavailable: use the default */
  }
  return defaultWorkspace(identity);
}

export function rememberWorkspace(id: string, workspace: Workspace) {
  try {
    localStorage.setItem(preferenceKey(id), workspace);
  } catch {
    /* the choice simply is not remembered */
  }
}

export const workspacePath = (workspace: Workspace) =>
  workspace === 'simple' ? workspaceConfig.simplePath : workspaceConfig.fullPath;
