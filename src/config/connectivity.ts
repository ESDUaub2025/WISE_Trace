// Adjustable values for detecting whether the server can be reached, and for background sending.
// "Online" in this app means "the WISE server answered", not "the phone has a network":
// a phone on Wi-Fi without internet reports itself online to the browser, which is why the app asks the server.

export const connectivityConfig = {
  /** A lightweight request the server answers only when it and its database are healthy. */
  healthPath: '/health',
  /** How long to wait for that answer. Rural mobile data can be slow; too short shows "offline" wrongly. */
  timeoutMs: 8_000,
  /** How often to ask while everything works. */
  checkEveryMs: 30_000,
  /** After a failure, ask again sooner at first, then back off to the upper limit. */
  retry: { firstMs: 5_000, maxMs: 60_000 },
} as const;

export const syncConfig = {
  /** How often waiting records are sent and fresh data fetched while the server is reachable. */
  everyMs: 30_000,
  /** After this long without a successful send, the status turns into a warning (PRD §10.2, default 24 h). */
  staleAfterHours: 24,
} as const;
