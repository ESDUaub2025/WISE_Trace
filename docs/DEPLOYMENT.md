# Deployment and recovery

This repository targets Cloudflare Pages and Supabase. Do not run the fictional seed against a hosted project. Production food-safety configuration, owner accounts and a custom domain require owner setup. Passing code checks does not constitute pilot sign-off.

## Local development

Use Node 24 and Docker Desktop with Linux containers. `npm ci`, `npm run db:start`, `npm run db:reset`. `npx supabase status` reports the local URL and publishable/anon key; place them in an ignored `.env.local` using the names in `.env.example`. `npm run dev` starts Vite. For fictional UI only, use `VITE_DEMO_MODE=true`; this never pretends to sync to a server. Seeded producer `rima` and supervisor `karim`: password `wise-demo-only`, PIN `2468` (local only).

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:db`, `npx playwright install chromium`, `npm run test:e2e`, `npm run build`. CLI is pinned as a dev dependency, invoked via npm or npx.

## Hosted Supabase

1. Create a Free project in the owner organization and record its region and database password securely. Keep the region aligned with the data-sharing agreement.
2. `npx supabase login`, then `npx supabase link --project-ref PROJECT_REF`. Review all migrations. `npx supabase db push` applies migrations only; it does not seed demo users.
3. Set server secrets: `npx supabase secrets set APP_ORIGIN=https://YOUR_DOMAIN OCR_ENABLED=false`. Add `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `OCR_CONFIDENCE_THRESHOLD` only if OCR is enabled. Never store these in VITE variables.
4. `npx supabase functions deploy sync`, followed by `user-admin`, `ocr`, `notifications`, `report`, `scheduled-tasks`. The report deployment includes the configured static font. Configured handlers authenticate users with Auth `getUser`; the legacy gateway check is disabled for asymmetric key compatibility. Test anonymous and forged-token denial after deployment. The scheduler endpoint uses its own `SCHEDULER_SECRET`. SQL cron already creates routine tasks every 15 minutes.
5. Disable public signups. Copy `docs/owner.bootstrap.example.json` to ignored `wise.bootstrap.json`; replace names, passwords and PINs. Set terminal-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (a server secret/service-role key), then run `node scripts/bootstrap-owner.mjs wise.bootstrap.json`. Clear the key from the terminal environment afterwards. The script creates separate Admin and Food-Safety Lead accounts and a placeholder draft; it refuses a populated installation and example passwords. The database transaction is exercised in `supabase/tests/bootstrap.test.sql`. Do not run the fictional seed against hosting. Enroll TOTP for both owners in the sign-in screen. Admin reviews the draft; the separate Food-Safety Lead approves a validated configuration using a fresh PIN. Create real sites, users and suppliers through the app.
6. Confirm private evidence bucket, RLS grants, sign-off failure cases and public leak tests in staging. Configure auth password limits and rate limits. Connect public QR and sign-in rate limits through Cloudflare WAF rules.

Official references checked during implementation: [local CLI](https://supabase.com/docs/guides/local-development), [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [MFA](https://supabase.com/docs/guides/auth/auth-mfa), [cron](https://supabase.com/docs/guides/database/extensions/pg_cron).

## Private GitHub and Cloudflare Pages

Push this repository to an organization-owned **private** GitHub repository. In Cloudflare dashboard → Workers & Pages → Create application → Pages → Connect Git, select it. Framework: Vite; command: `npm run build`; output: `dist`; Node version: 24. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_DEMO_MODE=false` in production and preview environments. The publishable key belongs in the browser; the service-role key never does.

Pages → project → Custom domains → Set up a custom domain. Add the domain and follow the DNS verification instructions; make QR URLs use that permanent hostname. Configure `APP_ORIGIN` to match it. No top-level `404.html` is present, preserving SPA routing. The public entry is `dist/p/index.html`. See [Cloudflare Vite guide](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/).

## Backups and restore drill

Create an age encryption key on an offline recovery workstation (`age-keygen`). Store the private key offline in two separately controlled locations. Put only its recipient in GitHub `BACKUP_AGE_RECIPIENT`. Set `BACKUP_DATABASE_URL` to the hosted Postgres connection string with TLS enabled; choose a reachable direct/session-pooler endpoint. GitHub Actions must be enabled on this private repository.

Dispatch the backup workflow and verify the encrypted artifact can be downloaded and decrypted. Thirty days of artifacts are retained; copy encrypted artifacts to institution-controlled off-site storage. Free-plan inactivity pauses and lack of automatic backups are operational risks; monitor scheduled backup failures. Media is separate from pg_dump and needs its own recovery copy.

Quarterly, create a disposable staging database, decrypt one artifact through a pipe into `pg_restore`, and verify row counts, genealogy, RLS and a neutral/released/recall QR example. Record restore duration and responsible person. Never restore a drill over production. The backup runner's pg_dump major version must match or exceed the server; verify before enabling the schedule.

## Pilot gates

Require validated protocol/configuration and labels, no unresolved critical security findings, all Appendix A tests, Arabic producer wording review, two rounds of actual producer usability validation and the mock recall drill. Production secrets, SMTP/push providers, thermal-printer hardware testing and off-site backup ownership cannot be substituted with local mocks.

## Web Push and configuration files

Generate the owner installation's VAPID key pair once with `node scripts/generate-vapid.mjs mailto:notifications@YOUR_DOMAIN`. This creates ignored `.vapid.env` without printing the private key. Set its values as Supabase secrets with `npx supabase secrets set --env-file .vapid.env`; put only the public key in Cloudflare's `VITE_VAPID_PUBLIC_KEY`. Rebuild the frontend after changing public environment variables. Keep the private key in a controlled secret store. Subscribers explicitly enable notifications from the bell; browser permission, a secure origin and platform support are required. Disabling notifications withdraws the account/device binding. Shared-device notifications contain generic text, and details require sign-in.

Set `SCHEDULER_SECRET` on Supabase. Configure the production GitHub environment's `SCHEDULER_URL` as `https://PROJECT_REF.supabase.co/functions/v1/scheduled-tasks` and the same secret as `SCHEDULER_SECRET`. The scheduled-notifications workflow calls it every 15 minutes; without secrets it reports unconfigured and makes no delivery request. Expired subscriptions are disabled; failures retry up to five times with a delivery lease. Successful provider acceptance is recorded separately from browser display, which cannot be guaranteed by the sender. The implementation uses payload-free push and native Web Crypto VAPID signatures per [RFC 8292](https://www.rfc-editor.org/rfc/rfc8292.html), with supported provider hosts restricted. It was checked against [MDN subscription documentation](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe). Real hosted provider/device delivery still needs a pilot test.

In Configuration, export the current SOP to a WISE JSON file. An Admin can import it into the editor and select a cooperative or global scope and effective date. Importing never imports approval or identity: save a new draft, then have the separate Food-Safety Lead approve with MFA and a fresh PIN. Existing batches retain their original SOP.
