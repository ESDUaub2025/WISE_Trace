# WISE platform guide

WISE helps a cooperative record where materials came from, how a product was made, who checked it, and where it went. It also provides training, quality records, stock management and reporting. Start with the daily tasks rather than trying to learn every page at once.

## Your first ten minutes

1. Sign in with your own username, password and PIN. The local demonstration accounts are `rima` (producer), `karim` (supervisor) and `manager1` (manager), with password `wise-demo-only` and PIN `2468`. These are fictional local accounts, not production credentials.
2. Read the three welcome screens. You can dismiss them with **Not now** or the close button. The walkthrough is remembered separately for each account on this browser.
3. On **Today**, open one due task. This takes you to its relevant record or form. Start with required training if you have not completed it.
4. Open a lot code to inspect its status, history, measurements and linked materials. A lot is a separately identified quantity of material or product.
5. Use **Help** at the top of any page. **This page** explains its purpose and steps; **Getting started** replays the walkthrough; **Explore pages** explains the pages available to your account. Help is available in Arabic and English. The full downloadable guide is in English.

## Registering and using the free online trial

On the sign-in screen, choose **Sign up** for full-service access or **Free online trial**. Both use the actual online application and require project administrator approval. Trials start with zero lots, suppliers, equipment, sales or production records; only entries you create appear in your workspace. Procedure definitions and learning materials are configuration, not example business records.

1. Enter your real email, a password of at least 12 characters, a username, your name, workspace name, region and a personal PIN. Choose the requested access plan.
2. Confirm your email using the verification message. If the signup screen asks you to check your email, sign in afterward using that email, password and PIN, then complete the workspace request. Production email verification must be enabled; local development automatically confirms email.
3. The request status page remains available while the administrator reviews it. You cannot enter an unapproved workspace. Use **Refresh status** to check the decision.
4. An administrator with MFA opens **Administration → Registration requests**, enters a review reason and chooses trial approval, full-service approval or rejection. Approval creates a new isolated workspace and grants manager/producer roles, never platform-admin or Food-Safety Lead roles.
5. Once approved, return to sign in. Newly registered accounts sign in using their email. Previously provisioned staff accounts retain username sign-in.
6. Trial workspaces support one account and store real entries online. In **Whey & materials**, the workspace founder can register their own supplier before receiving material. They can also register instruments in **Equipment**. Complete required training before starting production.
7. A workspace without an effective approved procedure shows a setup message. Its administrator must arrange the normal procedure and training approvals before production; registration never substitutes for those approvals.
8. The administrator can upgrade a trial to full service, with a recorded reason, to permit a team. Existing records remain in the same workspace. Batch release still needs an authorized independent reviewer and the required evidence.

The previous fictional browser fixture mode is retained only for development/browser tests. It is not the public free trial. Public deployment uses `VITE_DEMO_MODE=false`.

## The normal workflow

**Receive materials → start a batch → allocate inputs → record stage checks → package → review and release → record sales.**

For example, record a whey delivery with its supplier lot and receipt measurements. An authorized receiver decides whether to accept it. After completing required training, a producer starts a batch and allocates accepted materials. During each stage, the producer records the required observations and photos. Packaging creates identified stock awaiting review. A reviewer inspects the evidence and makes a separate release decision. Only released stock is available for sale. Opening the final packaging lot traces it back to its production batch and source materials.

Use the actual observation time, quantity and measurement. An entry made later retains both the observation time and the entry time. Do not treat example thresholds as an approved food-safety procedure: the cooperative's approved SOP controls production.

## What each page does

| Page | Why you use it | First action |
| --- | --- | --- |
| Today | Find due checks, training and other work; follow active batches. | Open a due task. |
| Whey & materials | Record incoming whey, ingredients and packaging materials, decisions and remaining balances. | Choose **Receive material**. |
| Production | Create batches, allocate accepted inputs and record each stage's checks. | Open a batch code, or choose **Start a batch** after training. |
| Stock & sales | Package completed production, review stock, print labels, record sales, losses, storage checks and counts. | Open a packaging lot and inspect its status. |
| Review | Inspect required evidence and decide release, hold or rejection. | Open a lot awaiting review. |
| Deviations | Document problems, complaints and corrective actions. | Create a deviation or inspect an open one. |
| Trace & recall | Follow genealogy and manage recall cases or practice exercises. | Open the affected lot or case. |
| Knowledge | Read illustrated procedures, FAQs and troubleshooting; complete training assessments. | Open a required module. |
| Equipment | Register instruments and record verification/calibration checks. | Check the instrument's status and due date. |
| Dashboards | Inspect authorized operations and impact summaries with filters and definitions. | Choose a view and reporting period. |
| Reports | Export authorized registers, indicators and traceability records. | Select a report and its filters. |
| Organization | Manage profiles, consent, alerts, people, devices, agreements and monthly reports. | Update your own profile or preferences. |
| Administration | Draft and approve procedure versions, publish training and manage operational controls. | Inspect the current approved procedure before drafting changes. |

## Accounts and responsibilities

Your role, cooperative scope and individual authorizations determine what you can see and save. A visible page does not grant permission for every action on it.

| Role | Main responsibility |
| --- | --- |
| Producer | Complete training, receive materials if authorized, record production checks and evidence. |
| Supervisor | Review cooperative work, check instruments and make authorized quality decisions. |
| Cooperative manager | Monitor stock and sales, manage authorized people/devices and cooperative reports. |
| WISE administrator | Manage platform configuration, registries, training and diagnostics. |
| Food-Safety Lead | Independently approve procedures and perform authorized safety reviews and recalls. |
| Partner | Inspect agreed data within authorized scope; raw cooperative access requires an enabled agreement. |
| Donor | Read aggregate impact indicators with privacy suppression. |
| Consumer | Scan the package QR to see available public product information without a staff account. |

Administrators and Food-Safety Leads use additional MFA verification. A different Food-Safety Lead approves an administrator's procedure draft. Keep your own password and PIN private; switch accounts when sharing a phone.

## Understanding status and offline work

**Received** means a material has been recorded, while **accepted** means an authorized receiving decision permits its use. **In production** means work is ongoing. **Awaiting review** means production or packaging still needs a reviewer. **Released** means the stock has passed its required release workflow. **On hold**, **rejected** and **recalled** require the indicated restriction to be respected. A packaging record or a completed check does not itself release a product.

**Saved on device** means the record is stored locally. **Synced** means it has reached the server. **Provisional** means server checks or decisions are still pending. A **conflict** needs authorized review; repeatedly submitting the same record does not resolve it.

Sign in online before working offline so your authorized session and working records are cached. Keep using the same browser and device. Required media must be downloaded in Knowledge while connected. Reconnect and press the connection indicator to synchronize, then check for conflicts or pending evidence. Offline critical receiving decisions require the previously prepared, valid credential and your PIN. Release, recall and configuration changes require online authorization. Older archived records need an online search.

Do not clear browser storage while unsynchronized records exist. On a shared device, restore the original author's session to upload their pending records; switching people does not transfer authorship.

## Common questions

- **Why can I not start a batch?** Check required training, the approved procedure and your authorization.
- **Why is a source lot missing from allocation?** Check its acceptance, expiry, cooperative and remaining balance.
- **Why can I not release or sell?** Inspect the lot status, required interval checks, photo uploads, laboratory results, critical deviations and the review decision. Release also needs a connection and fresh PIN.
- **Why is a button unavailable?** Your role, current status, connection or required evidence may restrict that action. Ask the responsible supervisor to inspect the record.
- **Why do dashboard numbers change?** Verify the dates, cooperative, region, product and status filters, then read the indicator definition. Demographic summaries use current consenting profiles and suppress small groups.
- **Why did a notification or email not arrive?** Read in-app alerts first. External delivery needs explicit consent where applicable and a configured provider. Inspect delivery status with an authorized manager.
- **How do I correct a saved record?** Use the available correction/amendment workflow with a reason. Approved history remains preserved.
- **How do I reopen the introduction?** Choose **Help → Getting started**. The close button or Escape dismisses the popup.

## Detailed feature reference

The following sections describe the remaining controls and advanced workflows. Work only with actions your account is authorized to perform.


## Role and advanced workflow reference

**Producer:** Sign in online once. Complete current required training. Today shows overdue checks first. Receive materials from registered suppliers; supplier declarations remain distinct from your measurements. Open a batch to record a current-stage check; photograph the display, confirm the value and save. Attach a voice note when useful. Records show saved on device until synchronization succeeds. Excess provisional allocation needs a reason and supervisor review. Rejected/held/expired inputs are excluded. Packaging creates review stock and never implies release.

**Shared phone:** Each person signs in separately with their own username/password and PIN. Use the person button to switch with a PIN. Every saved record carries the active person's identity. Do not share PINs. Re-authenticate online when the offline session expires.

**Offline receiving:** An authorized receiver signing in online prepares a PIN-protected credential on that device. Enter the PIN again to Accept, Hold or Reject whey received on that same device while offline. The decision remains provisional; other devices must wait for synchronization. Expired, revoked or altered signatures become review conflicts. Batch release, recall and critical deviation closure still require a connection.

**Production records:** Stage history shows entry, end, elapsed hours and overdue status. Recurring checks advance locally while offline. For a late entry, supply the actual observed time; entered time stays separate and the server derives the due-time flag. Handovers preserve the original producer and every record's author. Abandoning an unpackaged batch requires a reason and retains its allocated inputs as consumed losses.

**Samples and equipment:** Open a lot to record a sample or attach a later laboratory result and evidence. Equipment verification records a method, reference, measured value, unit and result. A failed verification creates a review task; it does not replace official calibration.

**Exports:** Reports accept a date period, authorized cooperative and SOP version; the whey and batch registers retain their material filters in CSV, Excel and PDF. A lot's traceability export reconstructs its genealogy and linked operations, allocations, packaging, transactions, decisions, stage history and evidence metadata.

**Supervisor/QA:** Review evidence and outstanding deviations. An open critical deviation blocks release. Release, rejection, critical CAPA closure and recall require a connection and fresh PIN. The producer cannot release their own batch unless the approved exception is active. Decisions lock records; corrections require amendments.

**Cooperative Manager:** Review cooperative inventory and sales, registered people and devices. Record only actual transactions, with LBP exchange rate stored on each transaction. A donor-style sales total is gross recorded revenue, never profit or income.

**WISE Admin:** Draft versioned configuration. Placeholder banners remain until Food-Safety Lead approval. Keep historic versions intact. Review data quality, sync conflicts, due training/calibration and backup monitoring. User administration is server-side.

**Food-Safety Lead:** Enroll TOTP. Review and approve a different administrator's procedure draft. Use trace-forward and trace-back to investigate. Mock recall records a drill without changing stock/public statuses. Live recall updates affected product pages and alerts responsible roles. Record recovery and closure actions.

**Partner:** View authorized cross-cooperative operations and definitions behind indicators. Export only data within your access scope.

**Donor:** View aggregate indicators only. Groups with fewer than five producers are suppressed. Read each indicator's definition; no unsupported CO₂, income or certification claim is made.

**Consumer:** Scan the package QR for origin, ingredients, allergens, best-before and storage advice. A recalled product shows a recall notice. Unknown or unreleased product information is unavailable. Follow the printed product label.

**Learning offline:** Open Knowledge to read illustrated steps, FAQs and troubleshooting in Arabic or English. Use “Download module for offline use” while connected to store its private pictures/videos for the signed-in person. Complete the picture assessment; incorrect answers require another attempt. Checkpoint help follows the batch’s original SOP step.

**Training administration:** Admins upload pictures or videos (maximum three minutes, compressed output up to 10 MB) and publish bilingual versioned modules against an approved SOP. Configure optional refresher days; 0 means no expiry. Approving a changed SOP versions its required training and assigns affected producers a 14-day refresher task. New installations must publish required introductory training before producers can create batches.

**Receipt measurements:** Each whey receipt shows the measurements configured by its SOP. Enter readings and select the instruments used; blank optional fields stay blank. Confirm or edit each supplier declaration separately. A calibration warning calls for supervisor review. Ingredient and packaging-material receipts retain supplier lots, quantity, unit, receipt time and any known expiry.
**Material balance:** Open a whey or ingredient lot to see received, allocated, disposed, diverted and remaining quantities. Record disposal with a method, or diversion with a recipient. Select closure only after recording all remaining material. Offline entries stay provisional until synchronized.

**Labels:** Open a packaging lot, choose the language and number of copies, then download its A4 label PDF. Print at actual size. Bluetooth printing is available when the approved SOP contains a compatible printer profile. Review final label content with the Food-Safety Lead before production use.

**Notifications:** Open the bell to read alerts and mark them read. Your acknowledgments survive offline reloads. In Organization, Alert preferences records your international phone number and explicit critical-alert consent; save with consent unchecked to withdraw. External delivery uses a development log provider until configured for production.

**Device alerts:** In the bell panel, enable device notifications and accept your browser's permission request. Shared phones show generic text; sign into WISE for details. Disable device notifications there to withdraw. This option stays unavailable until the owner configures Web Push.

**Configuration files (Admin and Food-Safety Lead):** Export the current SOP for reuse. Importing fills a new draft; choose global or cooperative scope and an effective date, then save. The Food-Safety Lead approves the separate draft with MFA and a fresh PIN. Import never transfers approval. Existing batches continue under their original version.

**Samples and laboratory reports:** Record the sample ID and sampling time when collected. Add the laboratory, report reference, result and report photograph later. If the batch SOP requires a laboratory report, release remains blocked until its passing result and evidence have synchronized. For recurring checkpoints, every required interval needs its own reading.


**Operations dashboards:** Supervisors see cooperative operations. Managers can switch cooperative, project and impact views within their authorized cooperative. Admins, Food-Safety Leads and partners can inspect cross-cooperative aggregates. Choose dates, region, cooperative and an operations batch status. The operations table shows pending reviews, open deviations, stock, training, expiring whey, calibration, late records and device/sync health. Donors receive aggregate impact metrics with small groups suppressed.

**Recall cases:** Open a case from Recall to inspect affected source lots, related batches, stock and recorded buyers. Add stop-sale, notification, retrieval or destruction actions with quantities and notes. Close a real case after recording stop sale; mock exercises may instead record trace completion. Closing the case preserves the recall history and affected product statuses.

**Stock and storage:** Inventory separates released stock from stock awaiting review, held or recalled. Open a packaging lot for the produced/sold/removed/returned/remaining equation and configured tolerance. Record loss or disposal with a reason. Storage inspections require a location, four condition checks and a photograph; temperature/humidity are required when configured. Dirty inspections create deviations, and scheduled inspections remain due until photo evidence synchronizes.

**History search:** Use Archive search while online to find older closed lots by their codes. Open a result for genealogy and record/evidence history. This lookup does not expand the normal offline cache.

**Photo cross-check:** Original manual readings remain immutable. In a lot's evidence list, Cross-check photograph sends an existing measurement picture to the configured OCR provider and appends a review note with the original and suggested values. A disabled provider leaves manual recording available. New checkpoint photographs can provide a suggestion before confirmation; low-confidence suggestions leave the value empty.

**Administration:** Partner access to raw cooperative records requires an enabled data agreement and a reference. Disabling that agreement changes the snapshot access fingerprint. For a verified departure request, first disable the producer; then anonymize their profile with a reason and confirmation. Production authorship remains pseudonymous. Review historical free-text/media and institution-retained audit archives under the applicable retention policy.

**SOP migration:** An Admin with MFA can select an active, unpackaged batch and an approved compatible SOP, enter a reason and re-enter their PIN. Stages and checkpoints must match so earlier production evidence stays valid; material changes to those definitions require a new batch. Required new training must be complete or covered by an authorized supervised exception. Earlier records keep their original SOP, and the migration creates an amendment. Batch details show process attention and training validity at qualification.

**Monthly reports:** In Organization, a Manager selects their cooperative, adds up to ten email recipients, and enables the monthly schedule. Admins can configure a global schedule. The scheduler sends the previous complete calendar month's impact and operations CSVs when email credentials are configured; delivery history shows status and retries. Disabled schedules and inactive/unauthorized owners do not send.


**Products and demographic summaries:** All three dashboard views can filter production by product and batch status. A product/status cohort includes linked source materials and descendant production; an unallocated receipt is excluded when those filters are selected. The same cohort is used by exports. Current consenting profiles are shown separately by sex/age band; groups below five are hidden for every viewer. This current profile summary follows cooperative/region scope rather than the production-period filters.

**Configuration dictionaries and process controls:** In an Admin SOP draft, optional `units` restricts receipt choices to supported `kg`, `L`, `unit`; `ingredient_types` supplies the ingredient dropdown. `packaging_options`, `packaging_sizes`, `deviation_categories` and label templates use the same approved/versioned workflow. Optional `data_quality_rules` sets `reception_range`, `overdue_calibration`, `storage_conditions`, `late_entries` to `warning` or `blocking`; `late_entry_hours` defaults to 24. Impossible quantities/dates, unsafe input use, excess sales, missing release evidence and critical release safety always block. Blocking calibration/late records remain reviewable sync conflicts; blocking storage conditions retain the inspection, create a critical deviation and prevent sale until resolved.

**Formal KPI metadata:** An Admin opens the Formal indicator dictionary, edits labels/definitions/sources/exclusions and saves a dated draft. A different Food-Safety Lead approves it with MFA and PIN through the configuration list. Calculations and access scope stay fixed to the implemented methodology; changing them requires a reviewed implementation change. Historical reports select the definition effective at the reporting cutoff.

**Printed lot OCR:** With a receipt photograph, Read printed lot number requests a text suggestion. Review its confidence and correct/confirm the supplier lot field before saving. Existing manual codes are preserved. Below the confidence threshold, no code is prefilled. The suggestion and confirmed code are retained in the receipt facts.

**Diagnostics:** Oversight can open Client error tracking in Administration. Queued errors upload after reconnection and show only coarse error codes, screens, device IDs and times. No error messages, form values, photos or secrets are captured. Server error-status events are available in Supabase Edge logs.
