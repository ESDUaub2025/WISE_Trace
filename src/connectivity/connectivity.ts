// One answer to "can we reach the WISE server right now?", shared by both workspaces.
//
//   online       the server answered recently
//   unreachable  the phone has a network, but the server did not answer (no internet behind Wi-Fi, server down)
//   offline      the phone has no network at all
//
// Recording works in every state; only sending and online-only actions wait for "online".
// Timings are in src/config/connectivity.ts.
import { connectivityConfig } from '../config/connectivity';
import { fileBackendUrl } from '../testing/file-mode';

export type Connectivity = 'online' | 'unreachable' | 'offline';
type Listener = () => void;

export interface ConnectivityTimings {
  checkEveryMs: number;
  retry: { firstMs: number; maxMs: number };
}

export interface ConnectivityOptions {
  /** Asks the server; resolves true when it answered healthily. */
  probe: () => Promise<boolean>;
  browserOnline: () => boolean;
  config?: ConnectivityTimings;
}

/** The state machine, free of browser globals so it can be tested with a fake clock. */
export function createConnectivity({ probe, browserOnline, config = connectivityConfig }: ConnectivityOptions) {
  // Optimistic start: assume the server is there if the phone has a network, then check at once.
  let state: Connectivity = browserOnline() ? 'online' : 'offline';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retryMs: number = config.retry.firstMs;
  let checking: Promise<Connectivity> | null = null;
  let running = false;
  const listeners = new Set<Listener>();

  function set(next: Connectivity) {
    if (next === state) return;
    state = next;
    listeners.forEach((listener) => listener());
  }

  function schedule(delay: number) {
    clearTimeout(timer);
    if (running) timer = setTimeout(() => void check(), delay);
  }

  /** Asks the server now. Concurrent callers share one request. */
  function check(): Promise<Connectivity> {
    if (checking) return checking;
    checking = (async () => {
      if (!browserOnline()) {
        set('offline');
        retryMs = config.retry.firstMs;
        return state;
      }
      const reachable = await probe().catch(() => false);
      // The network can vanish while the question is in flight; an answer that arrived just before does not count.
      if (reachable && browserOnline()) {
        set('online');
        retryMs = config.retry.firstMs;
        schedule(config.checkEveryMs);
      } else {
        set(browserOnline() ? 'unreachable' : 'offline');
        schedule(retryMs);
        retryMs = Math.min(retryMs * 2, config.retry.maxMs);
      }
      return state;
    })().finally(() => {
      checking = null;
    });
    return checking;
  }

  return {
    get: () => state,
    isOnline: () => state === 'online',
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    check,
    /** Any request that got an answer proves the server is reachable. */
    reportReached() {
      if (state !== 'online') void check();
    },
    /** A request failed at network level: verify instead of waiting for the next scheduled check. */
    reportFailure() {
      if (state === 'online') void check();
    },
    /** The browser said the network came or went. */
    networkChanged() {
      if (!browserOnline()) {
        clearTimeout(timer);
        set('offline');
      } else void check();
    },
    start() {
      running = true;
      void check();
    },
    stop() {
      running = false;
      clearTimeout(timer);
    },
  };
}

const apiBase = import.meta.env?.VITE_API_URL ?? '/api';
const demo = import.meta.env?.VITE_DEMO_MODE === 'true';

async function askServer() {
  // The demo build has no server: the browser's own network flag is all there is.
  if (demo) return true;
  if (fileBackendUrl) {
    const response = await fetch(fileBackendUrl, {
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(25000),
    });
    const health = (await response.json()) as { ok?: boolean; ready?: boolean };
    return response.ok && health.ok === true && health.ready === true;
  }
  const response = await fetch(`${apiBase}${connectivityConfig.healthPath}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(connectivityConfig.timeoutMs),
  });
  return response.ok;
}

/** The app-wide instance. */
export const connectivity = createConnectivity({
  probe: askServer,
  // Only an explicit "false" counts as no network (some runtimes do not report the flag at all).
  browserOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
});

/** True when the server answered recently. Use this instead of navigator.onLine. */
export const isOnline = () => connectivity.isOnline();

/** Starts watching. Called once from src/main.tsx. */
export function watchConnectivity() {
  window.addEventListener('online', connectivity.networkChanged);
  window.addEventListener('offline', connectivity.networkChanged);
  // A phone waking from sleep may have changed network without telling the page.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void connectivity.check();
  });
  connectivity.start();
}
