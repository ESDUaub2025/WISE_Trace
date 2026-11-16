import { fileEpoch, fileTesting } from '../testing/file-backend';

export const workerDraftKey = (userId: string, scope?: string) =>
  fileTesting
    ? `wise-worker-draft:${fileEpoch()}:${userId}:${location.hash.split('?')[0]}${scope ? ':' + scope : ''}`
    : undefined;
export function clearWorkerDraft(userId: string) {
  const key = workerDraftKey(userId);
  try {
    if (key)
      for (const name of Object.keys(sessionStorage))
        if (name === key || name.startsWith(key + ':')) sessionStorage.removeItem(name);
  } catch {
    /* Saving a record does not depend on browser draft storage. */
  }
}
