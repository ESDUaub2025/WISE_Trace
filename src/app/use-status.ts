// React hooks for the two app-wide status stores. Components re-render when the status changes.
import { useSyncExternalStore } from 'react';
import { connectivity, type Connectivity } from '../connectivity/connectivity';
import { syncStatus, type SyncStatus } from '../offline/sync-status';

export function useConnectivity(): Connectivity {
  return useSyncExternalStore(connectivity.subscribe, connectivity.get, connectivity.get);
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(syncStatus.subscribe, syncStatus.get, syncStatus.get);
}
