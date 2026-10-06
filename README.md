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

See [architecture](docs/ARCHITECTURE.md), [data model](docs/DATA_MODEL.md), [requirement evidence and remaining work](docs/PROGRESS.md), [decisions](docs/DECISIONS.md), [deployment](docs/DEPLOYMENT.md) and [role guide](docs/USER_GUIDE.md). Food-safety defaults are placeholders pending Food-Safety Lead approval. The build is not a food-safety certification.

This is an implementation milestone. The unchecked requirements in PROGRESS.md remain necessary for the full MVP. [Test evidence](docs/TEST_EVIDENCE.md) distinguishes the passing workflows from acceptance details and field checks still outstanding.
