# Live worker application revamp

The published application is the `build:file-test` build deployed to the `gh-pages` branch of `ESDUaub2025/WISE_Trace` and served at `https://esduaub2025.github.io/WISE_Trace/` (until 2026-11-16 it was `NizarSH98/wise-trace-test`, kept as a backup). It keeps the existing Google Apps Script URL and username-only testing protocol. This update does not require changing or redeploying Apps Script and does not clear shared records.

## Interface ownership

`src/app/AppRoot.tsx` selects `src/worker/WorkerWorkspace.tsx` for the file-backed build, including existing bookmarks. Daily navigation is Today, My work and Help. File-backed users cannot accidentally switch into the specialist console through account settings or task fallbacks.

`src/worker` owns the shell, record summaries, human-readable history, setup, test decisions, problem capture/resolution and failed-change recovery. `src/simple` supplies the guided receiving, production, packaging and sales pipelines. Both use the existing identity, IndexedDB outbox, synchronization and shared snapshot provider.

## Main workflow

1. Choose a username. Add the first supplier directly from Today or receiving.
2. Record a delivery through short questions, fresh measurements and a final review.
3. Record an explicit **test decision** with a reason. This is stored as `testing_review`, not a signed food-safety decision.
4. Choose accepted, unexpired whey and confirm the quantity actually used. In the file build, batch creation and all input allocations are one immutable `batch` append with an `allocations` array.
5. Record required checks and explicitly confirm production stage transitions. A future recurring check does not block completing the current step. A failed required check remains outstanding.
6. Add packaging materials if missing, return to the job, then record packaging. Packaging alone does not permit sales.
7. Review packed stock separately for **test sales**, with a reason. Required production checks and unresolved problems are checked before that test decision.
8. Record a sale against eligible stock; amounts above available stock are rejected.

Problems remain attached to their record. A separate, reasoned `testing_resolve` action closes open problems on that record for testing. These simulation actions are never used outside the file-backed build.

## Display rules

Worker screens format known fields deliberately. They do not serialize arbitrary objects, show internal IDs, or fill empty rows with placeholders. Relevant quantities, readings and timestamps remain visible. References are available in a collapsed label section. History is chronological, with translated checkpoint/stage names and formatted evidence.

Current limitations are explained in Help, with a compact test indicator in the header. The procedure and limits remain sample configuration. Required photos are not bypassed: a photo-dependent check explains that it cannot be completed in this backend. Formal training/signatures and production approvals are not simulated as completed training or real certification.

## Reliability

- Existing shared records and the workspace epoch remain unchanged.
- Receiving, packing and sale answers have per-user, per-workspace session drafts, cleared on successful local save. Receiving drafts are separated by supplier. Browser storage failure does not prevent entry.
- Background refresh pauses during a task, avoiding moving choices under the user's finger.
- The interface warns before leaving an unfinished task through its own navigation.
- Shared-file append retries keep immutable IDs. Each attempt checks the current shared history for stock, decision and stage consistency.
- Rejected shared changes remain local conflicts, with a clear path to remove only the failed unsent change and re-enter it. Existing shared records are preserved.
- These browser-side checks improve consistency for cooperative testing. The intentionally open JSON service is not a production authorization or rule-enforcement boundary.

## Validation

`tests/file-testing.spec.ts` uses an intercepted Apps Script service with fictional data. It covers shared records across users, persistence/reset, setup return paths, the complete receive-to-sale journey, Arabic mobile layout, readable history, unfinished-task navigation, offline sending, concurrent stock changes and failed-change recovery. These tests do not write real shared records.

Unit tests cover current shared quantities, duplicate allocations, unit mismatch, expiry, required measurements, required production evidence, separate review/release, overselling and evidence formatting. Run the ProjectGraph contracts for `CMP_SIMPLE_APP` and `CMP_SRC` for the configured checks.

The usability targets from the original PRD still require testing with dairy workers. Automated checks establish specified behavior and layout observations, not field usability or food-safety compliance.

## Rules added on 2026-11-15 (logic and reliability review)

Saving
- A record the shared file refuses is removed from the device at once and its reason is shown on the form. An older refused record can no longer make a later, accepted save look failed (which led to double entry).
- Decision and problem screens show the actual reason instead of a general "could not save".
- The app reopens without a connection for the remembered person; unsent records stay listed and are sent when the file can be reached. A failed request updates the connection indicator immediately.

Entering
- Numbers are checked on their own question: amounts above zero, whole pouches, whey made between now and 14 days ago, readings inside the physical range of the instrument (`min_plausible` / `max_plausible` in the procedure).
- Each question is a step in the address (`?step=2`): the phone's Back button returns one question, and a reload reopens the same question with its answers.
- "Something's not right" on a checklist needs at least one unticked item.

Production logic
- A check that does not pass opens a problem on the batch. Repeating the check does not close it; someone records how it was resolved. Open problems block acceptance and release.
- A batch can be stopped with a reason before packing (PRD FR-BAT-10). Its inputs stay consumed.
- Starting a batch with no bulgur, salt or other ingredient recorded tells the person and offers to add them; each ingredient used is listed on the batch by name.
- Packing compares everything packed from the batch with the kilograms that went in. Outside the procedure's `expected_yield`, a written reason is required (PRD FR-ALC-06). A batch can be packed in several sessions until its packed kishk is reviewed (FR-PKG-03).
- A batch follows its packed kishk: waiting for review, on hold, rejected, released, and closed once all released stock is gone (FR-BAT-11). Materials read "In stock" or "Used up".
- The decision screen suggests an outcome from the readings (FR-WHY-08) and shows pasteurization, appearance, smell and container. History names who recorded each entry.

Checks: `npm test` (156), `npm run test:file-test` (12 browser scenarios), `npm run test:e2e` (20), and the guided-flow scenarios of `npm run test:live` against the local server.
