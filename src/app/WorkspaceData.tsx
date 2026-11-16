// The active person's data, loaded once and shared by both workspaces.
// Responsibilities that used to be duplicated in each app live here:
//   1. show what is stored on the device immediately, then refresh from the server
//   2. send waiting records and fetch changes on a timer while the server is reachable
//   3. lock the app when the server says this sign-in is no longer valid
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { syncConfig } from '../config/connectivity';
import { useConnectivity } from './use-status';
import { db } from '../offline/db';
import { syncStatus } from '../offline/sync-status';
import { overlay, snapshot, synchronize, type Snapshot } from '../lib/data';
import { useSession } from '../session/SessionProvider';

/** Errors that mean "this person must unlock or sign in again", not "try later". */
const sessionEnded = [
  'accountDisabled',
  'sessionChanged',
  'sessionExpired',
  'signInRequired',
  'secondFactorRequired',
  'deviceRevoked',
  'fileInvalidCredentials',
  'fileWorkspaceReset',
  'fileUsernameRequired',
];

interface WorkspaceDataValue {
  data?: Snapshot;
  error: Error | null;
  loading: boolean;
  /** Sends waiting records, then reloads. Returns the fresh data, or what is stored on the device when offline. */
  refresh: () => Promise<Snapshot | undefined>;
  /** Holds the timed refresh while a step-by-step screen is open, so lists do not change mid-step. */
  pauseBackground: (paused: boolean) => void;
}

const WorkspaceDataContext = createContext<WorkspaceDataValue | null>(null);

export function useWorkspaceData() {
  const value = useContext(WorkspaceDataContext);
  if (!value) throw new Error('WorkspaceDataProvider missing');
  return value;
}

export function WorkspaceDataProvider({ children }: { children: ReactNode }) {
  const { identity, lock } = useSession();
  const queryClient = useQueryClient();
  const online = useConnectivity() === 'online';
  const id = identity?.id;
  const key = useMemo(() => ['snapshot', id], [id]);
  const [paused, pauseBackground] = useState(false);

  // 1. Stored data first, so screens open at once even with no signal (NFR-01).
  useEffect(() => {
    if (!identity) return;
    let current = true;
    void db.cache.get(`snapshot:${identity.id}`).then(async (cached) => {
      if (!cached || !current || queryClient.getQueryData(['snapshot', identity.id])) return;
      queryClient.setQueryData(['snapshot', identity.id], await overlay(cached.value as Snapshot, identity));
    });
    return () => {
      current = false;
    };
  }, [identity, queryClient]);

  const query = useQuery({
    queryKey: key,
    queryFn: () => snapshot(identity!),
    enabled: !!identity,
    networkMode: 'always',
  });

  const refresh = useCallback(async () => {
    if (!identity) return undefined;
    try {
      await synchronize(identity);
    } catch {
      // The failure is published through the sync status; stored data is still shown below.
    }
    try {
      // networkMode 'always': without it the library pauses this call while the browser is offline,
      // and a record just saved on the device would not appear until the connection returns.
      return await queryClient.fetchQuery({
        queryKey: key,
        queryFn: () => snapshot(identity),
        staleTime: 0,
        networkMode: 'always',
      });
    } catch {
      return queryClient.getQueryData<Snapshot>(key);
    } finally {
      await syncStatus.recount(identity.id);
    }
  }, [identity, queryClient, key]);

  // 2. Background sending. Starts as soon as the server becomes reachable again.
  useEffect(() => {
    if (!identity || !online || paused) return;
    void refresh();
    const timer = setInterval(() => void refresh(), syncConfig.everyMs);
    return () => clearInterval(timer);
  }, [identity, online, paused, refresh]);

  // 3. The server ended this sign-in.
  const failure = query.error instanceof Error ? query.error : null;
  useEffect(() => {
    if (failure && sessionEnded.includes(failure.message)) void lock(failure.message);
  }, [failure, lock]);

  const value = useMemo(
    () => ({ data: query.data, error: failure, loading: query.isLoading, refresh, pauseBackground }),
    [query.data, failure, query.isLoading, refresh],
  );
  return <WorkspaceDataContext.Provider value={value}>{children}</WorkspaceDataContext.Provider>;
}
