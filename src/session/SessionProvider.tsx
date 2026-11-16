// React wrapper around src/session/session.ts: who is active, and the inactivity lock.
// Both workspaces read the active person from here, so there is exactly one sign-in state in the app.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { demo } from '../lib/api';
import { fileTesting } from '../testing/file-backend';
import type { Identity } from '../lib/domain';
import { sessionConfig } from '../config/session';
import { syncStatus } from '../offline/sync-status';
import { inactive, lastActivity, limitsFor, markActive } from './session-policy';
import { lock as lockSession, resume, signOut as signOutSession } from './session';

interface SessionState {
  status: 'loading' | 'locked' | 'active';
  identity: Identity | null;
  /** The person to offer first on the unlock screen (they were active when the app locked). */
  lockedPerson?: Identity;
  /** Why the app locked, as a translation key; shown once on the unlock screen. */
  notice?: string;
}

interface SessionContextValue extends SessionState {
  /** Called by the account screens once a person has unlocked. */
  activate: (identity: Identity) => void;
  /** Back to the unlock screen; the person stays remembered on this device. */
  lock: (notice?: string) => Promise<void>;
  /** Forgets a person on this device. */
  signOut: (id: string) => Promise<void>;
  clearNotice: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SessionProvider missing');
  return value;
}

/** For screens that only render when someone is active. */
export function useIdentity(): Identity {
  const { identity } = useSession();
  if (!identity) throw new Error('No active person');
  return identity;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<SessionState>({ status: 'loading', identity: null });

  useEffect(() => {
    void resume().then(({ identity, locked }) =>
      setState(identity ? { status: 'active', identity } : { status: 'locked', identity: null, lockedPerson: locked }),
    );
  }, []);

  const activate = useCallback((identity: Identity) => {
    void syncStatus.recount(identity.id);
    setState({ status: 'active', identity });
  }, []);

  const lock = useCallback(
    async (notice?: string) => {
      await lockSession();
      setState((current) => {
        // Data fetched for the previous person must not flash for the next one.
        if (current.identity) queryClient.removeQueries({ queryKey: ['snapshot', current.identity.id] });
        return { status: 'locked', identity: null, lockedPerson: current.identity ?? current.lockedPerson, notice };
      });
      syncStatus.reset();
    },
    [queryClient],
  );

  const signOut = useCallback(
    async (id: string) => {
      await signOutSession(id);
      queryClient.removeQueries({ queryKey: ['snapshot', id] });
      setState((current) =>
        current.identity?.id === id || current.lockedPerson?.id === id ? { status: 'locked', identity: null } : current,
      );
    },
    [queryClient],
  );

  const clearNotice = useCallback(() => setState((current) => ({ ...current, notice: undefined })), []);

  // Inactivity lock: a shared phone left alone asks for the PIN again (PRD FR-AUTH-05).
  const activeId = state.identity?.id;
  useEffect(() => {
    if (!activeId || demo || fileTesting) return;
    const { recordEveryMs, checkEveryMs } = sessionConfig.activity;
    let lastRecorded = 0;
    const onActivity = () => {
      if (Date.now() - lastRecorded < recordEveryMs) return;
      lastRecorded = Date.now();
      markActive(activeId);
    };
    const events = ['pointerdown', 'keydown', 'touchstart'] as const;
    events.forEach((name) => window.addEventListener(name, onActivity, { passive: true }));
    const timer = setInterval(() => {
      if (inactive(lastActivity(activeId), Date.now(), limitsFor(activeId))) void lock('lockedInactive');
    }, checkEveryMs);
    return () => {
      events.forEach((name) => window.removeEventListener(name, onActivity));
      clearInterval(timer);
    };
  }, [activeId, lock]);

  const value = useMemo(
    () => ({ ...state, activate, lock, signOut, clearNotice }),
    [state, activate, lock, signOut, clearNotice],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
