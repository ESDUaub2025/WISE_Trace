# WISE architecture

Source: root PRD v1.0, including Appendix A; implementation stack: supplied master build prompt. Every M and S requirement is in scope. P2 is excluded.

The React/TypeScript PWA reads a cooperative-scoped Dexie cache, submits device-generated UUID records to an atomic outbox, and reconciles through the independent Fastify API. Standard PostgreSQL owns permissions, allocation, stock, state transitions, versioned rules, genealogy and audit. Sign-in is a small module of this project (`server/auth`, explained in [AUTH.md](AUTH.md)): scrypt passwords, HttpOnly device sessions that hold several people per phone, and TOTP for privileged roles. Caddy serves the static frontend and HTTPS. Private media bytes live on an application volume, with access enforced by PostgreSQL metadata policies. UI validation is convenience, never authorization. Public `/p/` is a separate HTML entry and calls only the allow-listed product view and complaint function.

## Code map

One app, two workspaces over the same account, records and sync.

| Folder | Responsibility | Adjust values in |
| --- | --- | --- |
| `src/app/` | Root shell: session gate, shared data loader and background sending, connection indicator, route to a workspace | — |
| `src/config/` | Every adjustable client value: session, connectivity and sync timings, workspace choice | this folder |
| `src/session/` | Sign-in steps, PIN unlock (online and offline), lock, remembered people, device identity | `src/config/session.ts` |
| `src/account/` | The screens for the above, and the account sheet shared by both workspaces | — |
| `src/connectivity/` | "Can we reach the server?" (online / unreachable / offline) | `src/config/connectivity.ts` |
| `src/offline/` | Local database, outbox, sending status | — |
| `src/simple/` | Simple workspace (`/today`): one next step at a time for producers | `src/simple/settings.ts` |
| `src/full/` | Full workspace (`/`): lists, review, deviations, recall, dashboards, reports, administration | approved procedure (database) |
| `src/lib/` | Shared domain logic: API client, snapshot, schedules, labels, formatting | — |
| `server/auth/` | Accounts, passwords, device sessions, authenticator, sign-in flows | `server/auth/policy.mjs` |
| `server/http/` | Routes: session, data, media | — |
| `server/functions/` | Multi-step operations: sync, reports, user administration, privacy, OCR, notifications | — |
| `server/migrations/` | The database: schema, row-level security and every business rule | — |
| `server/cli/` | Operator recovery commands | — |

Who starts where: people whose only recording role is producer open the simple workspace; anyone with an oversight role opens the full one; both can switch from the account sheet and the choice is remembered per person (`src/config/workspaces.ts`). Work the simple workspace has no guided screen for opens the same lot in the full workspace.

## Boundaries and permissions

Staff accounts have a username and no email; self-registered people sign in with either. Verified public registration is enabled only with SMTP. The password is asked once per device; after that a person picks their name and enters their PIN. The server checks the PIN when reachable; otherwise a salted PBKDF2 value on the device does, for a limited number of days. Sensitive actions always require server PIN validation and a short-lived, single-use sign-off. Online access requires a valid HttpOnly-cookie device session with an unexpired sign-in for the acting person. Admin and food-safety roles get no data until the server has recorded a TOTP proof for that sign-in. The API sets PostgreSQL's transaction-local authorization context. Device revocation clears the local cache on reconnect. Disabled-account pending evidence is quarantined for review rather than executing safety decisions. Details, sources and limits: [AUTH.md](AUTH.md).

RLS on all tables: cooperative members read only their cooperative; global operational roles are Admin, Food-Safety Lead and Partner. Donors can access only aggregate RPCs with groups below five suppressed. Operation-specific write functions implement the PRD permission matrix. Client direct mutation privileges are revoked for ledgers and critical state. Private media object paths start with cooperative UUID, verified against device/user scope; signed URLs expire.

## Sync protocol

An envelope contains UUID, action, author, device, cooperative, observed UTC time, config version, base revision and payload. The local record and outbox entry commit together. Replay uses UUID idempotency and per-device ordered delivery. Structured data precedes compressed photo/voice upload. Retries retain original evidence; transactional server failures create conflict tasks with original payload. A pending request is never removed until a server receipt is durable locally. Duplicate batches are safe. Crash recovery retries `syncing` entries. Observed-time validation uses effective config and state history, with present holds/rejections also preventing new allocations.

| Class | Actions | Behaviour |
| --- | --- | --- |
| Safe | checkpoints, measurements, notes/media, checklist, storage inspection, deviation, training | Append local evidence; retain attribution and both timestamps |
| Provisional | receipts, batch, consumption, packaging, sales; same-device whey decision | Validate stock, training, config and lifecycle on server; conflicts become review tasks |
| Online only | cross-device whey decisions, release/reject, recall, critical CAPA closure, config, users | Require connection, current authorization and sign-off |

Offline sessions expire after seven days by default; inactivity and sync alert periods are configuration. Cache includes authorized lots, suppliers, schedules, rules and training. Do not claim browser IndexedDB encryption; use OS/device protection, revocation and minimal cached identity data.

## State machines

Whey: Received → Accepted / Hold / Rejected; Hold → Accepted / Rejected; residual disposal closes the ledger. Rejected, held or expired inputs are ineligible. Batch: Draft → In Production → Awaiting Review → Released → Closed, with On Hold, Rejected and Withdrawn/Recalled branches. Released/rejected/recalled records lock, amendments preserve originals. Configured stage timelines operate within In Production. Critical deviation holds its lot. Release requires complete required records, no open critical deviations, required labs, trained author and distinct releaser unless approved exception flags WISE review.

Recall: Open → In progress → Closed; case actions track stop-sale, notification, recovery and destruction. Live recall traverses generic consumption edges and updates public statuses. Mock recall uses the same query, stores duration and never mutates lot/public states.

## Delivery and operations

Vite builds the app and the plain public page to `dist`; Caddy provides the SPA fallback. The database is migrations only. CI runs types, lint, Vitest, the server and SQL rule tests, and Playwright. The nightly workflow encrypts pg_dump and a separate recursive evidence/training archive before uploading a paired 30-day artifact. Media archives verify hashes and completion before non-overwriting recovery to a separate project; the hosted quarterly restore drill remains an operator gate. Deployment requires owner accounts, production secrets and Food-Safety Lead approval. External messaging defaults to a logged provider; OCR defaults to feature-disabled Claude vision behind a server interface.

Human usability and protocol approval require actual cooperative participants and cannot be replaced by automated tests.

## Resumable snapshot replication

Private snapshot_change stores table keys and top-level transaction IDs, never record bodies. snapshot_changes reads the actual row under caller RLS and sends deletion markers for removed/hidden records. A pinned PostgreSQL transaction window and primary-key pagination let clients resume and handle lower sequence numbers that commit late. Snapshot rows and their cursor are persisted together. Stock balance IDs remain dirty until the final snapshot cache commits successfully.

Read clients pin the original person (the `X-Wise-User` header) for the full download. Browser Web Locks serialize same-account replica writes; clients without Web Locks use an IndexedDB transaction lease across tabs, renew ownership when persisting replica pages, and guard final snapshot writes by generation. Expired leases are recoverable; a tab that loses ownership cannot overwrite a newer replica. Actual Safari/Samsung hardware coverage remains a pilot check. Each replica is partitioned by user, endpoint, installation epoch and access fingerprint. Cached screen data hydrates first; permission changes require fresh sign-in and remove that account's cached snapshots/training media while preserving outbox evidence.

Bootstrap is resumable and bounded to recent history, active production, positive stock and required ancestors. Online archive lookup retrieves older closed lots without adding them to the offline replica. References remain available, and monthly cache fingerprints rebase historical amendments received through deltas. Routine refreshes only transfer changed rows and affected stock balances. The visibility design follows PostgreSQL's [transaction snapshot functions](https://www.postgresql.org/docs/current/functions-info.html#FUNCTIONS-PG-SNAPSHOT), and the local concurrent-transaction check covers a delayed lower-revision commit.


## Final operational controls

Product/status cohort filters are applied to the same impact calculation core used by dashboard exports and monthly reports. Source receipts are included when linked to a matching batch; an unallocated receipt is not part of a filtered production cohort. Operational activity uses the same matching rule. Demographic presentation is a separate current-consent aggregate and suppresses groups under five for all roles.

Formal KPI metadata is selected from approved, effective, global dictionary versions. Calculation/visibility fields cannot be changed through metadata drafts. Physical/safety invariants always block; the approved SOP can choose warning/blocking for reception range overrides, overdue calibration, storage conditions and late records. Critical stock deviations prevent outgoing sales.

Client diagnostics keep only a code, bounded screen identifier, user/device binding and timestamp. They queue in user-partitioned local storage and upload on reconnection. Oversight RLS scopes reads. Server JSON responses log only structured error status, not bodies or credentials. Deployment operators monitor these logs and existing per-device sync health.
