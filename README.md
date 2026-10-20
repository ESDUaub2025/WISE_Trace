# WISE · Digital Traceability & Impact

An offline-first Arabic/English PWA for cooperative whey-based kishk production. Built from the root PRD, with React, Vite, TypeScript, Dexie and Supabase. The independent `/p/` page exposes only allow-listed product information.

```powershell
npm ci
npm run db:start
npm run db:reset
node scripts/setup-local.mjs
# In a second terminal: npx supabase functions serve
npm run dev
```

Docker Desktop must be running. Local demo credentials: `rima` / `wise-demo-only`, PIN `2468`; supervisor `karim` uses the same local password/PIN. Never use these outside local development. `VITE_DEMO_MODE=true` enables a fictional local UI preview with device-only saves.

```powershell
npm run typecheck
npm run lint
npm test
npm run test:db
npx playwright install chromium
npm run test:e2e
npm run test:api
npm run test:live
npm run build
```

The current deployment target is an [independent VPS with Supabase removed](docs/VPS_DEPLOYMENT_PLAN.md). That plan includes the required backend migration; the existing application still uses Supabase until the replacement is implemented and tested.

See [architecture](docs/ARCHITECTURE.md), [data model](docs/DATA_MODEL.md), [requirement evidence and remaining work](docs/PROGRESS.md), [decisions](docs/DECISIONS.md), [earlier managed deployment walkthrough](docs/DEPLOY_MVP.md), [deployment and recovery reference](docs/DEPLOYMENT.md) and [user guide](docs/USER_GUIDE.md). Food-safety defaults are placeholders pending Food-Safety Lead approval. The build is not a food-safety certification.

The local MVP runs with real Supabase Auth, database, private media and offline sync. Hosted deployment and field acceptance remain owner/pilot gates. PROGRESS.md distinguishes implemented workflows from details awaiting complete acceptance evidence. [Test evidence](docs/TEST_EVIDENCE.md) distinguishes the passing workflows from acceptance details and field checks still outstanding.
