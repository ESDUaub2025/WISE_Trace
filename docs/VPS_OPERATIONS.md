# WISE VPS operations

The application now uses Fastify, its own sign-in module (see [AUTH.md](AUTH.md)), standard PostgreSQL 17, private media files and Caddy. Supabase is removed. The existing `wise-production` EC2 instance is preserved: `13.221.70.85`, region `us-east-1`, instance `i-0769edfae3af17899`.

## Current access

Expected address: **https://wise.13.221.70.85.sslip.io**. Public access and certificate issuance require inbound TCP 80 and 443 in security group `sg-0ed4d85ce3f44d97f`. Only the proxy publishes ports. PostgreSQL and the API have no public port mappings.

On the local computer, `secrets/production.bootstrap.json` contains the initial administrator and food-safety lead usernames, passwords and PINs. Use separate people for these roles. First login asks each person to scan an authenticator QR and enter its six-digit code. Store the authenticator secret in a password manager for recovery. Credentials and the SSH key are excluded from Git and Docker build contexts, and protected by Windows permissions.

The production database starts without sample business records. It contains the administration workspace, separate owner accounts and an **unapproved placeholder procedure draft**. The food-safety lead must review actual production rules before approval. No software deployment can supply that professional approval.

## Costs

The application, database, Docker Engine, proxy and certificate require no software subscription. No extra AWS instance, managed database, load balancer, NAT gateway, paid domain or monitoring subscription was created. The existing 20 GiB disk is used; compute, storage, public IPv4 and transfer remain subject to the actual AWS account's billing terms. The account returned no credits and no usable plan information, so **zero AWS charges have not been established**. A budget alert is not a spending cap. Do not enable automatic paid scaling.

The free DNS hostname is supplied by [sslip.io / nip.io](https://nip.io/). It depends on the current public IP and a third-party DNS service. A stop/start may change an automatically assigned EC2 address. Before distributing permanent QR labels, use a stable domain and a deliberate address-management plan.

## Registration and trials

With no SMTP sender configured, the public signup form explains that the project administrator issues accounts. It does not pretend to send email. This keeps access controlled. To enable verified self-registration, set `SMTP_URL` and `MAIL_FROM` in `/opt/wise/.env`, then recreate the API. Use a verified sender and its real sending limits.

New users verify email, sign in and complete their workspace request. They receive no membership before administrator approval. The administrator selects an empty trial workspace or full service. Trials allow one account, save real entries online and contain no sample records. Full service allows a team. A trial owner cannot upgrade their own account. Global reports exclude trial workspaces as defined by the existing reporting rules.

## Server layout and routine commands

`/opt/wise` holds root-readable environment settings, deployment configuration and application code. Docker volumes retain PostgreSQL data, private media and certificates across restarts. The server has 2 GiB swap for memory pressure. Application images are built on the development computer, not on the 1 GiB server.

```bash
sudo docker compose --project-directory /opt/wise ps
sudo docker compose --project-directory /opt/wise logs --tail 50 api worker
sudo docker compose --project-directory /opt/wise restart api worker
sudo systemctl list-timers wise-backup.timer
df -h /
free -m
```

Logs omit passwords, cookies and request bodies. Do not run `docker compose down -v`: it removes persistent data. Keep `/opt/wise/.env` private; it contains database and authentication secrets.

## Updates

Run type checks, lint, unit tests, backend tests, PostgreSQL tests and browser workflows locally. Run `npm run build:production`: it explicitly disables fictional demo mode and writes to `build/production`, separately from test builds. Transfer `server/` to `/opt/wise/server` and those static files to `/opt/wise/site` through SSH. These directories are mounted read-only in their containers. Rebuild and transfer application images when dependencies change. Take an encrypted backup before replacing an established installation. Apply migrations with the owner connection, then prepare the restricted application login:

```bash
sudo docker compose --project-directory /opt/wise run --rm migrate
sudo docker compose --project-directory /opt/wise run --rm migrate node server/provision-runtime.mjs
sudo docker compose --project-directory /opt/wise up -d --force-recreate api worker web
```

The API uses a restricted `wise_app` PostgreSQL login. Every browser database operation sets a transaction-local application role and authenticated identity. Browser-supplied SQL, role and assurance claims are not accepted. MFA assurance is attached to the actual verified server session. Sessions use HttpOnly cookies; local offline profiles do not contain refresh tokens.

Cached users can unlock offline records with their PIN. Switching to a different account online requires its password when its current server session is unavailable. A known disabled account cannot reopen cached data; already recorded offline evidence can still be retained for administrator review without applying operational changes.

## Backups and recovery

`wise-backup.timer` creates an encrypted archive daily. It briefly pauses the API and worker to keep the SQL dump and media consistent, then restarts them. Archives contain the database, private media, environment settings and SHA-256 manifest. Seven days are retained under `/var/backups/wise`.

The **decryption key stays on the local computer** in `secrets/production-backup.agekey`; only its public recipient is on the server. Keep an additional offline copy of this key. Download encrypted archives regularly: a copy on the same VPS cannot protect against complete loss of that VPS. Do not commit decrypted archives or upload the private key to GitHub.

To recover, decrypt an archive into a new private directory on a separate installation, verify `SHA256SUMS`, restore the SQL dump with `pg_restore`, and extract private media into its new volume. Use the same authentication secret from the encrypted environment file so enrolled authenticators remain usable. Test a new hostname before switching traffic. Never overwrite the running installation as a recovery experiment.

## Scaling

The current server is for a small pilot. Watch memory, swap, disk space, errors and response time. Keep at least 20% disk space available. Start by reducing unnecessary concurrent exports and moving builds off the server, which this package already does. Upgrade compute only with a budget; then consider moving PostgreSQL and media separately. Preserve the same permission rules and test account isolation after each move.

OCR and external SMS/WhatsApp delivery are disabled without explicit provider configuration. In-app notifications and the local background worker work without those paid integrations.
