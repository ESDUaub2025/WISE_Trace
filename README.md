# WISE · Digital Traceability & Impact

An offline-first Arabic/English PWA for cooperative whey-based kishk production. React, Vite, TypeScript and Dexie talk to an independent Fastify API, PostgreSQL and private media files. The independent `/p/` page exposes only allow-listed product information.

One app, two workspaces over the same account, records and sync:

- **Simple** (`/today`): one next step at a time, for producers recording on a phone.
- **Full** (`/`): every list, review, dashboard, report and setting.

Producers start in Simple, everyone with an oversight role in Full; the account sheet switches between them.

## Run it locally

Docker Desktop must be running.

```powershell
npm ci
npm run db:start
npm run showcase:demo      # fictional cooperatives; add `-- --reset` to rebuild the database
# In a second terminal:
npm run dev
```

Open `http://127.0.0.1:5173` (in development `localhost` moves there, the only origin the local server trusts).

| Account | Role | Starts in |
| --- | --- | --- |
| `nadia` | Producer, first day, empty cooperative | Simple |
| `rima` | Producer | Simple |
| `karim` | Supervisor | Full |
| `manager1`, `admin1`, `food_safety1`, `donor1` | As named | Full |

All fixture accounts: password `wise-demo-only`, PIN `2468`. Administrator and Food-Safety Lead accounts set up an authenticator app at first sign-in. `npm run showcase:clean` instead serves a fresh installation with only `wise_admin` and `wise_food_safety` (password `wise-local-showcase`). Run one showcase at a time; both use port 3007. Never use these accounts outside local development.

`VITE_DEMO_MODE=true` builds a fictional preview with no server and device-only saves.

## Where to change things

| To change | Edit |
| --- | --- |
| Password, lockout, sign-in lifetime, authenticator rules | `server/auth/policy.mjs` |
| Inactivity lock, offline allowance | `src/config/session.ts` (the approved procedure can override per cooperative) |
| Connection checks, background sending interval | `src/config/connectivity.ts` |
| Who starts in which workspace | `src/config/workspaces.ts` |
| Simple workspace questions, levels, look, read-aloud | `src/simple/settings.ts` |
| Wording | `src/i18n/en.json`, `src/i18n/ar.json`, `src/simple/words.ts` |
| Thresholds, checkpoints, stages, shelf life | The procedure in the Admin page (versioned in the database) |

Code is formatted with Prettier (`npx prettier --write .`).

## Checks

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

The existing EC2 server runs the independent stack. Deploying this version requires new passwords for every account (see docs/AUTH.md §6). Follow the [deployment and operations guide](docs/VPS_OPERATIONS.md) for deployment, updates, credentials, recovery and costs. Initial production data contains only the administration workspace, two owner accounts and an unapproved procedure draft. No fictional lots, sales, suppliers or training completions are seeded.

See [architecture and code map](docs/ARCHITECTURE.md), [sign-in, sessions and connection status](docs/AUTH.md), [data model](docs/DATA_MODEL.md), [requirement evidence and remaining work](docs/PROGRESS.md), [decisions](docs/DECISIONS.md) and [user guide](docs/USER_GUIDE.md). Food-safety defaults are placeholders pending Food-Safety Lead approval. The build is not a food-safety certification.

The local fixture server is explicitly for testing and contains fictional accounts. Never run it on production. Without SMTP, new production accounts are issued by the project administrator; email registration becomes available after a verified sender is configured. Food-safety approval and field acceptance remain owner/pilot responsibilities.
