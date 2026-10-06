# Local automated evidence

These results describe a working implementation milestone, not completion of the entire PRD or production approval.

On 2026-10-06:

- TypeScript and ESLint passed.
- Vitest: 17 tests passed, including atomic media rollback, outbox save order, interrupted sync recovery, conflict retention, user partitioning, PIN verification and session limits.
- pgTAP: 51 checks passed against local PostgreSQL. Checks include cooperative isolation, denied raw donor reads, anonymous RPC grants, append-only audit/ledger records, prohibited state transitions, allocation and sales limits, training assessment validation and donor session boundaries.
- Playwright preview: 14 checks passed on desktop Chromium and Pixel 7, including offline reload, Arabic RTL, receipt declaration reuse and a public page without React.
- Playwright live: seven scenarios passed against local Supabase Auth, database, private Storage and Edge sync. A1 checks threshold suggestions and override deviations; A2 checks offline persistence and an allocation conflict; A3 checks photo retention with a simulated OCR provider response; A4 checks a critical release blocker and an independent supervisor's PIN release; A5 traces from whey through stock and sales, closes a mock recall, then checks a live public recall notice; A6 checks neutral/released public data in both languages; A7 checks donor suppression and indicator definitions.
- A clean local database reset applied migrations and loaded the fictional seed. Later migrations receive another clean reset before a release.
- `node scripts/live-api-check.mjs` passed the authenticated production/packaging/release/sale/mock/live recall workflow.

The browser scenarios correspond to A1–A7 but do not yet prove every bullet in those stories. Rejected receipts on a second device, scheduled home-screen drying checks, a producer with both production and release roles, and an actual Food-Safety Lead MFA session need additional browser coverage. Real OCR inference is untested without an Anthropic secret. Hosted latency, actual phone storage pressure, thermal printer behavior, SMS/WhatsApp delivery, backups and restore drills are not demonstrated by these local checks.

Run local live tests with `npm run db:start`, `node scripts/setup-local.mjs`, and `npx supabase functions serve` in a separate terminal, then `npm run test:api` and `npm run test:live`. Port 5173 must be free; the suite serves a production PWA build there. Preview tests use port 4173 and explicitly fictional UI data.
