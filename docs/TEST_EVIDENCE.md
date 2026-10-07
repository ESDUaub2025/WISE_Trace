# Local automated evidence

These results describe a working implementation milestone, not completion of the entire PRD or production approval.

On 2026-10-06:

- TypeScript and ESLint passed.
- Vitest: 36 tests passed, including atomic media rollback, outbox save order, interrupted sync recovery, conflict retention, user partitioning, PIN verification, sealed receiving credentials, signature binding, session limits and recurring stage schedules.
- pgTAP: 185 checks passed against local PostgreSQL. Checks include cooperative isolation, denied raw donor reads, anonymous RPC grants, append-only audit/ledger records, prohibited state transitions, allocation and sales limits, training content/schema and cooperative scope, SOP-triggered refreshers, completion expiry/task closure, measurement attribution/unit/equipment boundaries, owner bootstrap, offline signature tampering/device/expiry boundaries, server-derived late-entry flags, handover, abandonment losses, equipment checks and impact role boundaries.
- Playwright preview: 16 checks passed on desktop Chromium and Pixel 7, including offline reload, Arabic RTL, receipt declaration reuse and a public page without React.
- Playwright live: fifteen scenarios passed against local Supabase Auth, database, private Storage and Edge sync. A1 checks threshold suggestions and override deviations; A2 checks offline persistence and an allocation conflict; A3 checks photo retention with a simulated OCR provider response; A4 checks a critical release blocker and an independent supervisor's PIN release; A5 traces from whey through stock and sales, closes a mock recall, then checks a live public recall notice; A6 checks neutral/released public data in both languages; A7 checks donor suppression and indicator definitions. The eighth scenario rejects an incorrect PIN, accepts whey provisionally on the receiving device, reloads offline, confirms that PIN/plaintext secret are absent from the outbox, and synchronizes the signed decision. The ninth scenario uses actual TOTP enrollment and AAL2 admin login, compresses a real picture and one-second synthetic video, uploads to private Storage, denies anonymous access, publishes a resource-backed module, and verifies producer downloads after an offline reload.
- Added material-balance, yield and impact checks cover residual closure rollback, recorded diversion destinations, packaging yield justification, zero denominators, test-data exclusions and metric units. Label unit tests check required approved fields and the thermal raster header; live label downloads check A4 dimensions and multi-page copy counts in both languages. Offline material disposition survives a reload and reconciles after sync.
- The notification scenario confirms persisted consent, ignores caller-provided destinations/consent, queues a personal acknowledgment offline, reloads it, syncs it, and denies delivery after withdrawal.
- Native VAPID tests verify ES256 signatures independently, exact provider audience, bounded expiry, private endpoint/redirect denial and payload-free delivery. Push SQL checks private subscriptions, saved device consent, job leases and withdrawal. Device/provider delivery is not simulated as a completed production send.
- Laboratory SQL checks sample chronology and identity, result attribution and synchronized report evidence before release. A recurring-check test denies release when only one of two required 12-hour intervals has a reading.
- A clean local database reset applied migrations and loaded the fictional seed. All migrations through 202610060063 applied in the latest clean reset.
- `node scripts/live-api-check.mjs` passed the authenticated production/packaging/release/sale/mock/live recall workflow.
- `node scripts/check-reports.mjs` passed CSV, Excel and PDF exports through the actual Edge function, date/material filtering and traceability history reconstruction. PDF size depends on the selected dataset; Arabic and Latin glyph availability is checked separately. Full font embedding avoids a fontkit subset encoder failure found by the live test.

The live scenarios now add rejected receipt isolation on a second device, server rejection of that allocation, due home-screen drying checks and the next 12-hour task, actual Food-Safety Lead MFA for mock/live recalls, and a producer with both production and release roles under default and self-release exception SOPs. SOP file import creates a cooperative draft; separate MFA Admin/Lead sessions save and approve it with fresh PIN, and existing lots preserve their original SOP. Real OCR inference is untested without an Anthropic secret. Hosted latency, actual phone storage pressure, thermal printer behavior, SMS/WhatsApp delivery, backups and restore drills are not demonstrated by these local checks.

Run local live tests with `npm run db:start`, `node scripts/setup-local.mjs`, and `npx supabase functions serve` in a separate terminal, then `npm run test:api` and `npm run test:live`. Port 5173 must be free; the suite serves a production PWA build there. Preview tests use port 4173 and explicitly fictional UI data.

## Recovery, localization and filter follow-up

Five recovery checks include actual age encryption/decryption, wrong-key and ciphertext tampering rejection, whole-manifest verification before uploads, nested pagination and non-overwriting target isolation. An actual local backup copied and checked all three uploaded evidence/training objects; this is not a hosted restore drill. The private nightly workflow now publishes the paired encrypted database and media archives only after both succeed. Recovery requires a distinct empty private project and preserves object paths.

The local unit suite now passes 42 tests, including Western digits by default, explicit Eastern Arabic preference, Beirut dates, original-SOP offline expiry and material ledger arithmetic. Notification acknowledgment failures remain queued and do not block operational/media sync; A2 passes with an invalid acknowledgment. Nine additional database assertions pass for cooperative/region impact scope and donor suppression (194 checks total). The full current live suite passes 17 scenarios, including manager scope, filtered CSV export and donor regional suppression; the preview suite passes 16 checks. This historical result predates the operations dashboards and bounded snapshots described below. Product filtering, consent-based demographic presentation and hosted latency still require complete acceptance evidence.

## Incremental sync follow-up

All 65 migrations apply on a fresh local reset. The 205-check pgTAP suite passes. The actual two-transaction concurrency check proves that a delayed lower-revision commit is downloaded in the next window, with page-size-one resume and deletion propagation. Four new browser cases pass for delta-only refresh/offline persistence, interrupted bootstrap resume, interrupted balance refresh and blocked cached access after disablement while original-author evidence enters review. Unit merge replay and removal checks bring the local unit suite to 43 tests. The subsequent full 23-scenario browser run passes; no hosted scale or older-browser coordination claim is implied.

## Current local MVP result ? 7 October 2026

A clean installation applied all 91 migrations. The final database contract, source contract and hosted CI result are recorded in ProjectGraph and GitHub rather than inferred from this document.

- 46 Vitest tests pass across 18 files, including no-Web-Locks lease coordination, interval completeness, offline packaging/sale/return/loss overlays and interrupted snapshots.
- 278 database assertions pass across 27 files. New coverage includes bounded cache scope, latest-SOP creation, explicit PIN-controlled batch migration with historical evidence preservation, recall action validation, consent-aware delivery leases, schedule scope, anonymization, dashboards and stock balances.
- All 24 live Chromium/Pixel 7 scenarios pass, including A1-A7, actual Auth TOTP/AAL2, private media, self-release separation, cooperative/project/impact navigation, guided recall closure, delta sync and interrupted bootstrap recovery.
- Authenticated API lifecycle and CSV/XLSX/PDF checks pass. Complete cooperative exports include approved configuration and training references, retain historical records and exclude foreign cooperative membership. Data-quality exports include sync and late-entry counts; warning overrides use reception-override deviations.
- Deno checks pass for OCR, reports, privacy and scheduled tasks. OCR tests use a simulated provider response; actual Claude reading and live email/SMS/push delivery require owner credentials.

The live suite ran against the real local Supabase backend with demo mode disabled. Local automated evidence does not establish hosted uptime, production p95, two-cooperative field usability, physical printer compatibility, cross-browser hardware support or a timed hosted recovery drill. No production food-safety protocol approval is implied.


The completion follow-up adds product/status cohorts, consent aggregates, versioned KPI metadata, controlled receipt dictionaries, configurable process rules and privacy-preserving diagnostics. Database checks cover empty cohorts, unchanged unfiltered formulas, manager boundaries, demographic suppression/withdrawal, dictionary integrity and denial of safety-rule downgrades. Source/live checks are rerun after these changes; final results are recorded in ProjectGraph.


The final 24-scenario live suite passes (including product/status export parity). The dedicated real Auth privacy check also passes: disabled profile pseudonymization, metadata-key removal, anonymized sign-in address and banned login. It exposed and fixed the REST safe-update requirement on epoch rotation; SQL-only tests had not exercised that connection setting. Fresh preview fixtures replace transient acceptance data before handoff.
# Beginner guidance follow-up — 7 October 2026

The user guide now starts with a ten-minute introduction, daily workflow, page directory, role responsibilities, status/offline explanations and troubleshooting, followed by the full feature reference. The application includes bilingual page help, a replayable three-step welcome popup, account-specific dismissal on this browser, a directory of authorized pages and a guide download.

ProjectGraph `CMP_SRC` verification passed types, lint, all 46 unit tests and all 20 desktop/mobile browser cases (including four help cases). The help cases cover walkthrough completion and replay, dismissal after reload, role-filtered page guidance, guide download, Arabic and offline help after reload. A separate real-backend browser check signed in as `rima` and `karim`, confirmed independent welcome state on the shared browser and persistence, and captured desktop/mobile/Arabic screens without browser exceptions. The existing live login helper dismisses the introduction for workflow tests; the full database/live suite was not repeated for this UI-only change.

Screenshots: [Welcome](preview-help-welcome.png), [Desktop page help](preview-help-desktop.png), [Mobile page help](preview-help-mobile.png), [Arabic page help](preview-help-arabic.png).

