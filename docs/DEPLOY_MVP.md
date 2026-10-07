# Deploy the WISE MVP

The production app uses Supabase for authentication, private files and records, and Cloudflare Pages for the website. You need owner access to both accounts. Keep passwords and server secrets in their dashboards or your local ignored environment files.

## 1. Create the Supabase project

Open [Supabase](https://supabase.com/dashboard), create an organization/project and choose an appropriate region and plan. Save the database password securely. From the project's API settings, copy its project URL and browser publishable key into your local ignored `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_BROWSER_PUBLISHABLE_KEY
VITE_DEMO_MODE=false
```

Sign in and link the CLI, then apply the migrations:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
npx supabase functions deploy
```

This includes migrations `202610070092_self_registration.sql` and `202610070093_trial_reporting_scope.sql`. Do not run `db reset` or deploy `supabase/seed.sql` against the hosted project: the seed contains fictional accounts and business records.

## 2. Set up the project administrator

Use the controlled owner setup in [DEPLOYMENT.md](DEPLOYMENT.md) and [owner.bootstrap.example.json](owner.bootstrap.example.json). Copy the example into an ignored `wise.bootstrap.json`, replace every example value, and create the separate Admin and Food-Safety Lead accounts with `node scripts/bootstrap-owner.mjs wise.bootstrap.json`; server keys belong only in the terminal environment. Both enroll MFA. Have the lead validate and approve the procedure, and publish its required training. This gives the administrator the ability to review registration requests.

Public registration never grants administrator access. A verified registration is pending until an administrator explicitly approves a trial or full workspace. Trial workspaces allow one account; upgrading to full service permits team provisioning. Their business tables start empty.

## 3. Create the Cloudflare Pages website

Open [Cloudflare](https://dash.cloudflare.com/), go to Workers & Pages, create a Pages application and connect the private GitHub repository `NizarSH98/WISE_Trace`.

Set production branch `master`, build command `npm run build`, output directory `dist` and `NODE_VERSION=24`. Add the three public environment values from step 1. Use `VITE_DEMO_MODE=false` in both production and preview builds. Never place a service-role key, SMTP password or provider secret in a `VITE_` variable.

Deploy, then record the resulting HTTPS Pages URL. A custom domain can be attached afterward; use a permanent domain before printing production QR labels. [Cloudflare's Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/) deploys subsequent repository changes automatically.

## 4. Enable verified registration email

In Supabase Authentication settings, enable email signup and **Confirm email**. Set the Site URL to the HTTPS website URL and add that exact URL with a trailing `/` to the redirect allowlist. The app sends confirmation redirects to `window.location.origin + '/'`. See [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).

Configure a verified sender using [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp). Supabase's default SMTP delivery is restricted to project team addresses, so it cannot serve public registrations reliably. Email verification messages contain a confirmation link; the app does not email passwords or PINs.

Set the server-side `APP_ORIGIN` secret to the same HTTPS origin so Edge functions accept the website. Configure other providers and scheduled jobs using [DEPLOYMENT.md](DEPLOYMENT.md) when they are needed.

## 5. Verify the deployed flow

- Register with a real test email and confirm it. Verify that the status page shows pending and no cooperative records are available.
- As the MFA administrator, approve a free trial with a reason.
- Sign in with the new email/password/PIN. Verify that the new workspace has no sample lots, suppliers, equipment or sales.
- Register your own supplier and save a material receipt. Sign out and sign in again, or use another device, and verify that the same record is present.
- Check that another account cannot read the workspace's records. Confirm that team provisioning remains blocked for a trial.
- Approve full service and verify that authorized team setup becomes available. Complete the procedure/training and release checks before actual production.

The website URL, project URL and browser publishable key are configuration. Account passwords, service keys and SMTP credentials are secrets. Hosted publishing cannot be completed until the owner provides the projects and authenticates the CLI/dashboard connections.
