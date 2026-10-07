# Role guide

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
