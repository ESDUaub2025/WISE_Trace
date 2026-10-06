# WISE architecture

Source: root PRD v1.0, including Appendix A; implementation stack: supplied master build prompt. Every M and S requirement is in scope. P2 is excluded.

The React/TypeScript PWA reads a cooperative-scoped Dexie cache, submits device-generated UUID records to an atomic outbox, and reconciles through authenticated Supabase Edge Functions. Postgres owns permissions, allocation, stock, state transitions, versioned rules, genealogy and audit. UI validation is convenience, never authorization. Public `/p/` is a separate HTML entry and calls only `public_lot_view`.

## Boundaries and permissions

Supabase Auth uses server-created synthetic email identifiers for usernames. No producer email is required. Shared-device sessions are partitioned by user; a salted PBKDF2 PIN verifier unlocks local switching, while sensitive actions require server PIN validation and a short-lived, single-use sign-off. Admin and food-safety roles require JWT AAL2. Device revocation clears cache on reconnect. Disabled-account pending evidence is quarantined for review rather than executing safety decisions.

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

Vite builds SPA and plain public page to `dist`; Cloudflare Pages provides SPA fallback (no top-level 404). Supabase schema is migrations only. CI runs types, lint, Vitest, pgTAP and Playwright. Nightly hosted pg_dump is encrypted before uploading a 30-day artifact; quarterly restore drill is documented. Deployment requires owner accounts, production secrets and Food-Safety Lead approval. External messaging defaults to a logged provider; OCR defaults to feature-disabled Claude vision behind a server interface.

Human usability and protocol approval require actual cooperative participants and cannot be replaced by automated tests.
