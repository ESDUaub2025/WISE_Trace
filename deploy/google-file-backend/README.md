# Open testing: username only

Users type any username and click **Start testing**. First use creates the account;
later visits reopen it. The name is remembered on the device. No password, access
key, email or PIN is required. This intentionally allows anyone to use any name.

## One owner update to the existing Google script

1. Open the existing **WISE Test Backend** project at <https://script.google.com/home>.
2. Replace its Code.gs with [Code.gs](Code.gs), then save.
3. **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy.**
   Keep **Execute as: Me**, **Who has access: Anyone**, and the same /exec URL.

There is no new project, account list or key setup. The first health request to
the updated script automatically removes the old tester accounts, stored key
digests and shared records, once. Afterward it preserves newly entered data.
Opening the /exec URL should report "mode":"username-only-v2".

The Drive file stays private, but the public script deliberately offers open
username-only access to its contents. Use fictional testing data only.

To clear the test workspace again later, the owner can run **resetTestingData**
from the Apps Script editor. It cannot be called through the public endpoint.
The app detects each reset and discards its old cached data and pending saves.

## App behavior

- Starts without sample people, lots, tasks, suppliers, equipment or completions.
- Retains a blank shared workspace, placeholder procedure and learning templates.
- Creates real test profiles only when someone chooses a name.
- All testers have equal editing access in this temporary version.
- Supports adding suppliers and equipment through the existing forms, then adding
  ordinary production records and training completions.
- Preserves UUID action retry handling, serialized file writes and version checks.
- Uses a separate wise-file-open-test-v2 local database, isolated from previous
  keyed tests and normal WISE installations.
- Full approvals, uploads, administration and scheduled reports still need the
  full WISE backend. This test mode does not reproduce its SQL permission rules.

## Build and publish

The public endpoint and GitHub Pages subpath live in config.json.

~~~powershell
npm run build:file-test
~~~

Publish only build/file-test/ to the main branch of the dedicated public
NizarSH98/wise-trace-test repository. The app is served at
<https://nizarsh98.github.io/wise-trace-test/>. No source checkout, environment
file or private Drive data belongs in that repository.

The build includes a copy of Code.gs at /wise-trace-test/Code.gs for the owner
to copy during the one-time Google update. Publishing code here does not update
Google's deployed version. While Google still runs the old version, the new
login shows “Testing is being updated” instead of requesting obsolete keys.

npm run build:production retains normal Fastify authentication. Open testing is
confined to the separate file-backed testing build.

## Checks and limits

~~~powershell
node --test deploy/google-file-backend/backend.test.mjs
npm run test:file-test
~~~

Local tests simulate Google services; live migration occurs only after the
owner publishes the new Google version. Check the live health mode before
claiming that old remote records were removed.

The JSON cap is 200,000 characters and 100 test profiles. Google account quotas
still apply. Changing a username creates another profile; it is not a rename.

References: [deploying a new version](https://developers.google.com/apps-script/concepts/deployments),
[web apps](https://developers.google.com/apps-script/guides/web),
[quotas](https://developers.google.com/apps-script/guides/services/quotas).
