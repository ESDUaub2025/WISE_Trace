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

Set `BACKUP_SUPABASE_URL` and server-only `BACKUP_SERVICE_ROLE_KEY` for the same project as `BACKUP_DATABASE_URL`. The workflow encrypts the database first, then recursively copies all private evidence and training bytes into a separate age archive. A hash manifest covers the names, MIME types and exact bytes, including paginated nested folders. Plaintext media and database files are never written to the runner. Keep media immutable and prevent deletion during backup; a database-first snapshot then includes all referenced media while later uploads can be present as harmless extra files. Coordinate a maintenance window if operators can modify/delete objects.

Dispatch the backup workflow and verify both encrypted artifacts can be downloaded and decrypted. Thirty days of artifacts are retained; copy the complete pair to institution-controlled off-site storage. Free-plan inactivity pauses and lack of automatic backups are operational risks; monitor scheduled backup failures. An artifact is published only if both backup steps succeed. GitHub retention is not a substitute for the institution's recovery archive.

Install [age](https://github.com/FiloSottile/age), set `AGE_IDENTITY_FILE` to the protected private key file, and run `node scripts/media-backup.mjs check MEDIA_ARCHIVE.age`. For recovery, provision a separate disposable Supabase project with the matching migrations and empty private buckets. Set `SUPABASE_URL`, server-only `SUPABASE_SERVICE_ROLE_KEY`, and `RESTORE_TARGET_CONFIRM` to the recovery project's exact URL origin. Run `node scripts/media-backup.mjs restore MEDIA_ARCHIVE.age`. The command checks the entire decrypted archive before any upload, refuses the source project or nonempty/public buckets, preserves object paths, and disables overwrites. Interrupted restores leave a partial recovery project; use a fresh disposable project for the next drill. Restore database metadata with the paired dump using the target's compatible roles and privileges; never treat restored `storage.objects` rows as recovered file bytes. Verify ownership policies and grants against the migration baseline because dumps omit owner/ACL restoration.

The media implementation follows Supabase's [list](https://supabase.com/docs/reference/javascript/storage-from-list), [download](https://supabase.com/docs/reference/javascript/storage-from-download), and [upload](https://supabase.com/docs/reference/javascript/storage-from-upload) APIs. Unit recovery checks cover nested pagination, corruption, truncation, duplicate paths and target isolation. Hosted disaster recovery still requires a timed staging drill and an owner-managed off-site copy.

Quarterly, create a disposable staging database, decrypt one artifact through a pipe into `pg_restore`, and verify row counts, genealogy, RLS and a neutral/released/recall QR example. Record restore duration and responsible person. Never restore a drill over production. The backup runner's pg_dump major version must match or exceed the server; verify before enabling the schedule.

## Pilot gates

Require validated protocol/configuration and labels, no unresolved critical security findings, all Appendix A tests, Arabic producer wording review, two rounds of actual producer usability validation and the mock recall drill. Production secrets, SMTP/push providers, thermal-printer hardware testing and off-site backup ownership cannot be substituted with local mocks.

## Web Push and configuration files

Generate the owner installation's VAPID key pair once with `node scripts/generate-vapid.mjs mailto:notifications@YOUR_DOMAIN`. This creates ignored `.vapid.env` without printing the private key. Set its values as Supabase secrets with `npx supabase secrets set --env-file .vapid.env`; put only the public key in Cloudflare's `VITE_VAPID_PUBLIC_KEY`. Rebuild the frontend after changing public environment variables. Keep the private key in a controlled secret store. Subscribers explicitly enable notifications from the bell; browser permission, a secure origin and platform support are required. Disabling notifications withdraws the account/device binding. Shared-device notifications contain generic text, and details require sign-in.

Set `SCHEDULER_SECRET` on Supabase. Configure the production GitHub environment's `SCHEDULER_URL` as `https://PROJECT_REF.supabase.co/functions/v1/scheduled-tasks` and the same secret as `SCHEDULER_SECRET`. The scheduled-notifications workflow calls it every 15 minutes; without secrets it reports unconfigured and makes no delivery request. Expired subscriptions are disabled; failures retry up to five times with a delivery lease. Successful provider acceptance is recorded separately from browser display, which cannot be guaranteed by the sender. The implementation uses payload-free push and native Web Crypto VAPID signatures per [RFC 8292](https://www.rfc-editor.org/rfc/rfc8292.html), with supported provider hosts restricted. It was checked against [MDN subscription documentation](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe). Real hosted provider/device delivery still needs a pilot test.

In Configuration, export the current SOP to a WISE JSON file. An Admin can import it into the editor and select a cooperative or global scope and effective date. Importing never imports approval or identity: save a new draft, then have the separate Food-Safety Lead approve with MFA and a fresh PIN. Existing batches retain their original SOP.
