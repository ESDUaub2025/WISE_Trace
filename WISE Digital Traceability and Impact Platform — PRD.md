# WISE Digital Traceability and Impact Platform — Product Requirements Document

Oct 6, 2026 · @Nizar Shehayeb

This PRD turns the WISE refined requirements baseline into a buildable specification for one integrated MVP release. Every original requirement is kept; additions are marked **\[Added\]** so reviewers can see what is new.

## Document control

| Item | Value |
| --- | --- |
| Product | WISE Digital Traceability and Impact Platform |
| Document | Product Requirements Document v1.0 (draft for review) |
| Source | WISE Refined Requirements Baseline (Pre-PRD) |
| Product owner | To be confirmed |
| Food-safety authority | To be confirmed (see Open decisions) |
| Technical lead | To be confirmed |

**How to read requirements**

- IDs follow the pattern `FR-<module>-<nn>` for functional, `NFR-<nn>` for non-functional and `KPI-<nn>` for indicators.
- Priority uses MoSCoW: **M** = must have in MVP, **S** = should have in MVP, **C** = could have (MVP if time allows), **P2** = Phase 2.
- "Configurable" means a WISE Project Administrator can change the value in the admin console without a code release.
- "Blocking rule" prevents the action; "warning rule" allows it with a recorded justification. Whether a rule blocks or warns is itself configurable unless marked **Always blocking**.

## 1. Overview and product vision

The platform is a simple, mobile-first system for recording and following whey-based kishk production from incoming whey reception through production, packaging, storage, release and commercialization.

It has four primary objectives:

1. Provide practical production and food-safety recordkeeping for cooperatives.
2. Establish reliable batch-level traceability between incoming raw materials and finished products.
3. Detect missing checks, deviations, rejected materials, expiring materials and batches requiring attention.
4. Automatically transform operational records into credible environmental, economic and social project indicators.

The platform minimizes manual data entry while preserving enough evidence for meaningful traceability and recall.

Dashboards update as records synchronize. The platform is therefore described as providing **near-real-time project monitoring**, not guaranteed real-time monitoring, because users may work with limited connectivity.

**Context \[Added\].** Production happens at cooperative sites in Lebanon where connectivity and electricity can be intermittent, devices may be shared, and producers vary widely in digital literacy. Kishk production spans several days (mixing, fermentation, drying, grinding), often partly outdoors. The product must work under those conditions, not just in an office.

## 2. Goals, non-goals and success criteria

### 2.1 Goals

- Make whey-to-package traceability the default outcome of normal work, not an extra reporting task.
- Give cooperatives a daily tool that tells them what needs attention now.
- Give WISE defensible, auditable indicators derived from operational records.
- Support a credible withdrawal or recall within minutes, not days.

### 2.2 Non-goals \[Added\]

- The platform does **not** certify food safety. It records evidence and human decisions made under approved WISE procedures.
- It is not an accounting, payroll or full ERP system. Sales records exist to support traceability and impact indicators.
- It does not replace laboratory analysis or regulatory inspection.
- AI does not make release, rejection or acceptance decisions.

### 2.3 Success criteria

The platform must let WISE answer these questions reliably:

| Question | What the system must show |
| --- | --- |
| Where did this package come from? | Production batch, packaging lot, cooperative, ingredient lots and incoming whey lot(s) |
| Where did this whey go? | Every batch that consumed a whey lot and the quantities involved |
| Can this batch be released? | Completeness of required records and reviews, and any unresolved critical deviations |
| What requires action right now? | Overdue checks, held or expiring materials, batches awaiting review, deviations, training due, calibration due |
| What has WISE actually achieved? | Defensible production, valorization, participation, commercialization and adoption indicators |
| Can we investigate a problem? | Who recorded, reviewed, changed, accepted, rejected, released, sold or recalled material and batches, and when |

### 2.4 Measurable MVP acceptance targets \[Added\]

Targets to be confirmed with WISE before pilot sign-off:

- Trace-back report from a package QR to whey lot(s) generated in under 10 seconds.
- Trace-forward from a whey lot to all affected batches, packages, stock and sales in under 10 seconds.
- A mock recall exercise completed end to end in under 30 minutes during the pilot.
- At least 95% of pilot batches reach Released or Rejected with complete required records.
- A trained producer records a routine checkpoint in under 30 seconds on a mid-range Android phone.
- At least 80% of pilot producers rate the app usable without assistance after training.

## 3. Scope and release plan

The MVP is one integrated release covering the full chain from whey reception to sale and recall, with all three dashboards. Modules share one data model and one audit trail, so they are delivered together rather than staged.

### 3.1 MVP modules

| # | Module | Origin |
| --- | --- | --- |
| 1 | Authentication, roles, cooperative isolation | Baseline |
| 2 | Cooperative, user and device management | Baseline + device/shared-phone support \[Added\] |
| 3 | Training and knowledge (versioned) with authorization gate | Baseline |
| 4 | Supplier registry and non-whey ingredient receipts with internal lot IDs | Baseline + ingredient receipt \[Added\] |
| 5 | Incoming whey receipt, measurements, sampling, Accept / Hold / Reject | Baseline |
| 6 | Whey lot shelf-life, expiry and disposal | \[Added\] |
| 7 | Material allocation and mass balance | Baseline |
| 8 | Production batch, lifecycle and multi-day stage tracking | Baseline + multi-day stages \[Added\] |
| 9 | Pre-production verification and configurable checkpoints | Baseline |
| 10 | Tasks, reminders and "What needs my attention now?" | Baseline |
| 11 | Deviations and corrective actions (CAPA) | Baseline |
| 12 | Batch status indicators (completeness, process, deviations, training) | Baseline |
| 13 | AI-assisted reading of displays (OCR) with human confirmation | Moved into MVP as **S** \[Changed\] |
| 14 | Packaging lots, labeling data, best-before and allergens | Baseline + labeling \[Added\] |
| 15 | Storage, inspections and inventory | Baseline |
| 16 | Batch release | Baseline |
| 17 | QR generation, label printing and public batch page | Baseline + label printing \[Added\] |
| 18 | Withdrawal / recall with trace-forward and trace-back | Baseline + mock recall mode \[Added\] |
| 19 | Sales and distribution | Baseline |
| 20 | Equipment and calibration records | Baseline (promoted to MVP) |
| 21 | Administrative configuration console | Baseline |
| 22 | Data quality controls | Baseline |
| 23 | Cooperative, project and impact dashboards with KPI dictionary | Baseline |
| 24 | Reporting and export (CSV, Excel, PDF) | Baseline |
| 25 | Offline-first PWA with sync status and conflict handling | Baseline + explicit sync rules \[Added\] |
| 26 | Arabic and English with RTL | Baseline |
| 27 | Audit trail, amendments and record locking | Baseline |
| 28 | In-app notifications plus WhatsApp/SMS for critical alerts | Baseline + external channel \[Added, S\] |

### 3.2 Phase 2

- Automated image-quality / appearance analysis (experimental decision support only).
- Sensor and data-logger integration (temperature/humidity during drying and storage).
- Laboratory system integrations.
- Advanced inventory (multi-site transfers, reservations).
- GS1 Digital Link identifiers where commercially appropriate.
- Richer geographic and policy dashboards, advanced donor reporting.
- Advanced analytics (yield prediction, deviation pattern analysis).
- Native mobile app wrapper if PWA limits are hit on target devices.
- Cost capture for producer income and profitability indicators.

## 4. Users, personas and roles

Access follows least privilege: users see only what their role and cooperative require. Producer identities, internal safety records, financial details, supplier-sensitive data and personal information never appear on the public QR page.

### 4.1 Roles

| Role | Main capabilities |
| --- | --- |
| Producer | Training, whey reception if authorized, production recording, photos, measurements, packaging |
| Cooperative Supervisor / QA | Review batches, approve or reject records, manage deviations, release batches |
| Cooperative Manager | Cooperative users, production overview, inventory and sales overview |
| WISE Project Administrator | Configure cooperatives, suppliers, SOPs, thresholds, training, users and settings |
| WISE Food-Safety Lead \[Added\] | Approve SOP and threshold versions, oversee recalls, view all quality records |
| Project / Technical Partner | Cross-cooperative operational and analytical dashboards |
| Donor / Policymaker Viewer | Aggregated impact indicators only |
| Public Consumer | Read-only QR product information |

A user may hold more than one role. Small cooperatives may have one person acting as both Producer and Supervisor; the system then applies the **separation-of-duties rule** in FR-REL-04.

### 4.2 Permission matrix (key actions)

Y = allowed, A = only with specific authorization flag, — = not allowed.

| Action | Producer | Supervisor/QA | Coop Manager | WISE Admin | Food-Safety Lead | Partner | Donor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Record whey receipt | A | Y | — | — | — | — | — |
| Accept / Hold / Reject whey | A | Y | — | — | Y | — | — |
| Create batch | Y (trained) | Y | — | — | — | — | — |
| Record checkpoints and measurements | Y | Y | — | — | — | — | — |
| Raise deviation | Y | Y | Y | — | Y | — | — |
| Close critical deviation | — | Y | — | — | Y | — | — |
| Release / reject batch | — | Y | — | — | Y | — | — |
| Initiate withdrawal / recall | — | Y | Y | Y | Y | — | — |
| Record sales | Y | Y | Y | — | — | — | — |
| Manage coop users | — | — | Y | Y | — | — | — |
| Change thresholds, SOPs, checkpoints | — | — | — | Y (draft) | Y (approve) | — | — |
| View cross-coop operations | — | — | — | Y | Y | Y | — |
| View aggregated impact | — | — | Y (own) | Y | Y | Y | Y |

### 4.3 Personas \[Added\]

- **Rima, producer (50s, rural cooperative).** Shares a phone with two colleagues, prefers Arabic, comfortable with WhatsApp and the camera, uncomfortable typing. Needs big buttons, icons, photo-first entry and a clear next step.
- **Karim, cooperative supervisor.** Reviews batches in the evening, often on mobile data. Needs a review queue and one-tap evidence viewing.
- **WISE project officer.** Prepares monthly donor reports. Needs consistent KPIs, filters and exports she can defend.
- **Consumer in a Beirut shop.** Scans the pouch out of curiosity. Needs a fast, attractive page in Arabic or English with origin story and best-before date.

## 5. Product design principles

1. **Traceability before dashboards.** Dashboards are generated from operational records, never from separately entered KPI values. Each downstream record stays linked to its origin: whey receipt → whey lot → kishk batch → packaging lot → inventory → sale.
2. **Evidence rather than paperwork.** Minimize typing through predefined selections, saved suppliers, defaults, QR/barcode scanning, photo capture, automatic timestamps, reusable ingredient records, measurement capture and optional AI-assisted extraction. Photos complement structured records; they never replace measurements or decisions.
3. **Safety decisions remain human-controlled.** AI may help read measurements or review images but never declares a batch safe. Accepting or rejecting whey, judging whether a deviation needs action, and releasing or rejecting a batch follow approved WISE procedures and are attributable to an authorized user.
4. **Configuration instead of hard-coded rules.** Thresholds, required measurements, checklists, SOPs, training requirements and checkpoints are administratively configurable and versioned, because the protocol will evolve after food-safety validation.
5. **Auditability.** Critical records are never silently overwritten. The system keeps original value, corrected value, user, timestamp and reason. Released or rejected batches lock; later changes are amendments.
6. **Version stamping \[Added\].** Every record stores the SOP, threshold set and training-module versions in force when it was created, so past records are judged against the rules that applied then.
7. **Works in the field \[Added\].** Every producer flow must work on a mid-range Android phone, one-handed, in sunlight, offline, in Arabic, by someone who prefers not to type.
8. **Public and internal are views, not copies \[Added\].** The public QR page and internal records read from the same data through a strict public projection, so nothing private leaks by accident.

## 6. Domain model and traceability genealogy

The platform is built around explicit traceability objects, not attributes of a production batch. Every physical material is a **lot** with a quantity, and every transformation is recorded as input lots consumed in stated quantities to produce output lots. Trace-back and trace-forward are traversals of that graph. \[Added: generic lot genealogy\]

This one rule covers the baseline's many-to-many whey allocation and also handles cases the baseline left open: one batch packaged on several days, partial packaging, and blending or rework where the approved process allows it.

&#91;embedded content: lot genealogy · inputs to batches to packaging lots to outflows\]

A problem with whey lot B traces forward to both batches and packaging lots 1 to 3; a problem with packaging lot 3 traces back to whey lot B and never implicates lot A.

### 6.1 Core entities

| Entity | Purpose | Key fields |
| --- | --- | --- |
| Cooperative | Participating organization | ID, name, region, contacts, status, date joined WISE |
| Production Site \[Added\] | Physical location of a cooperative | ID, cooperative, address/GPS, storage locations |
| User | Authenticated account | ID, cooperative, roles, status, training status, authorizations |
| Producer Profile | Impact demographics, separated and restricted | User ID, sex, age band, other agreed fields, consent |
| Device \[Added\] | Registered phone or tablet, possibly shared | ID, cooperative, label, last sync, status |
| Supplier | Reusable supplier record | ID, type (dairy, bulgur, salt, ingredient, packaging), contacts, approval status |
| Whey Lot | Incoming whey delivery | Lot ID, supplier, supplier lot, labneh lot, species, dates, mass, decision, expiry |
| Ingredient Lot \[Added\] | Received bulgur, salt and optional ingredients | Lot ID, supplier, supplier lot or internal receipt ref, type, quantity, unit, received date, expiry |
| Packaging Material Lot \[Added\] | Pouches, containers, labels | Lot ID, supplier, type, quantity |
| Kishk Batch | One production run | Batch ID, cooperative, producer, SOP version, state, current stage, dates |
| Consumption (allocation) | Input lot used by an output lot | Input lot, output lot, quantity, unit, time, user |
| Packaging Lot \[Added\] | Packages produced from a batch in one packaging session | Lot ID, batch, date, package type and size, count, mass, best-before, QR |
| Checkpoint Definition | Configurable step from the SOP | Version, stage, timing, role, data, range, photo rule, severity on failure |
| Checkpoint Record | Result of a checkpoint | Definition version, batch, values, evidence, user, device, time |
| Measurement | Any recorded value | Value, unit, time, user, equipment ID, source (manual / AI-assisted), image |
| Sample / Lab Result | Sample sent for analysis | Sample ID, linked lot, sampled time, lab, result, reference |
| Deviation | Out-of-range or nonconforming condition | Linked lot, issue, value, severity, detector, CAPA, reviewer, resolution |
| Decision | Accept / Hold / Reject / Release / Withdraw | Object, decision, reason, user, signature, time, evidence |
| Storage Location | Where stock sits | Site, name, conditions required |
| Inventory Movement \[Added\] | Ledger entry for stock | Lot, type (produced, sold, distributed, sample, lost, disposed, returned, adjusted), quantity, reason |
| Sale / Distribution | Commercial or other outflow | Packaging lot, date, quantity, transaction type, customer category, price, currency |
| Recall | Withdrawal / recall case | Trigger lot(s), scope, status, actions, public notice text |
| Equipment | Measurement device | ID, type, cooperative, calibration dates, status |
| Training Module | Versioned content | Module, version, language, assessment |
| Training Completion | Who completed what | User, module, version, date, score |
| Audit Event | Immutable change log | Object, field, old, new, user, device, time, reason |
| KPI Definition | Formal indicator definition | See section 8 |

### 6.2 Identifiers \[Added\]

- Every record has an internal UUID generated on the device, so records created offline never collide.
- Lots also have a short human-readable code printed on labels and spoken on the phone, for example `WL-AKR01-261006-03` (whey lot, cooperative code, date, sequence) and `KB-AKR01-261006-01` (kishk batch). Packaging lots use `PL-`.
- Human-readable codes for offline records are provisional until sync, then confirmed by the server; the UUID never changes and the QR uses an opaque token, not the readable code.

### 6.3 Genealogy rules

- A whey lot may feed several batches, and a batch may use several whey lots if the approved SOP allows it.
- A batch produces one or more packaging lots; each packaging lot belongs to exactly one batch unless a configured blending process exists.
- Blending or rework is modeled as a new batch whose inputs are earlier batches; the blended product inherits the full ancestry.
- Every lot has a computed **available quantity** = received or produced − consumed − sold − lost/disposed ± adjustments.

## 7. Functional requirements

Requirements are grouped by module. Priority: M = must, S = should, C = could, P2 = Phase 2.

### 7.1 Authentication and access (AUTH)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-AUTH-01 | Users sign in with phone number or username plus password or PIN; admins and Food-Safety Leads also use a second factor. | M |
| FR-AUTH-02 | Role-based access with cooperative-level data isolation enforced on the server, not only in the interface. | M |
| FR-AUTH-03 | **Shared-device mode \[Added\]:** several users of one cooperative can be signed in on one device and switch with a personal 4–6 digit PIN; each record is attributed to the active user. | M |
| FR-AUTH-04 | Critical actions (accept/reject whey, release/reject batch, recall, threshold change) require PIN re-entry at the moment of action as an authenticated sign-off. | M |
| FR-AUTH-05 | Sessions expire after configurable inactivity; offline sessions remain valid for a configurable period (default 7 days) before requiring online re-authentication. | M |
| FR-AUTH-06 | Accounts can be disabled immediately; a disabled user's pending offline records are still accepted on sync but flagged for review. | M |
| FR-AUTH-07 | Lost-device procedure: an admin can revoke a device, which wipes local data on its next connection. | S |

### 7.2 Cooperatives, users and devices (ORG)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-ORG-01 | Admins create and edit cooperatives with ID, name, region, production site(s), contacts, status and date joined. | M |
| FR-ORG-02 | Cooperative Managers create users in their own cooperative and assign roles; WISE Admins manage all. | M |
| FR-ORG-03 | User records hold role, status, training status, and authorizations (e.g. "may receive whey", "may release batches"). | M |
| FR-ORG-04 | Demographic data for impact is stored in a separate Producer Profile with restricted access and recorded consent. | M |
| FR-ORG-05 | Devices are registered to a cooperative with a friendly label (e.g. "Coop phone 2"). | S |

### 7.3 Training and knowledge (TRN)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-TRN-01 | Knowledge area with GMP, food-safety procedures, SOPs, short videos, illustrated instructions, FAQs and troubleshooting, in Arabic and English. | M |
| FR-TRN-02 | All content is versioned; each completion records module, version, date and assessment result. | M |
| FR-TRN-03 | Producers cannot independently create batches until required introductory training is complete. | M |
| FR-TRN-04 | Admins may grant supervised or exceptional authorization with a logged reason and expiry date. | M |
| FR-TRN-05 | When an SOP or module changes, affected users are assigned refresher training with a due date; overdue refreshers appear as tasks. | M |
| FR-TRN-06 | **Offline content \[Added\]:** required modules and SOPs can be downloaded to the device; videos are compressed for low bandwidth. | M |
| FR-TRN-07 | **Context help \[Added\]:** each checkpoint links to the relevant SOP step or short video. | S |
| FR-TRN-08 | Simple picture-based assessments suitable for low-literacy users. | S |

### 7.4 Suppliers and ingredient receipts (SUP)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-SUP-01 | Reusable supplier registry with types: dairy/labneh, bulgur, salt, other ingredient, packaging. | M |
| FR-SUP-02 | Supplier approval status (approved, provisional, suspended); suspended suppliers cannot be selected for new receipts. | S |
| FR-SUP-03 | **Ingredient receipt \[Added\]:** every receipt of bulgur, salt, optional ingredients and packaging material creates an Ingredient Lot with internal lot ID, supplier lot if available, quantity, unit, date and expiry if known. | M |
| FR-SUP-04 | Optional photo of the supplier label at receipt. | S |
| FR-SUP-05 | Batches select ingredients from available Ingredient Lots rather than typing supplier details again. | M |

### 7.5 Incoming whey receipt and whey lots (WHY)

Every whey delivery creates an independent Whey Lot. Information declared by the dairy is stored and displayed separately from values measured by the cooperative.

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-WHY-01 | Creating a receipt generates a unique Whey Lot ID automatically. | M |
| FR-WHY-02 | Source fields: dairy supplier, supplier lot/reference, labneh production lot, milk species, whey generation date/time, collection date/time. | M |
| FR-WHY-03 | Supplier declarations: pasteurization confirmation, labneh ingredients, starter culture, salt addition stage, other declarations; each marked "declared by supplier". | M |
| FR-WHY-04 | **Supplier declaration reuse \[Added\]:** a standing declaration per supplier pre-fills these fields; the receiver confirms or edits per delivery. | S |
| FR-WHY-05 | Transport and reception: transport method/conditions, container type and condition, receipt date/time, received mass, receipt temperature. | M |
| FR-WHY-06 | Quality measurements as required by the active SOP: pH, titratable acidity, °Brix or approved rapid solids indicator, salt/conductivity, appearance, odour. Each stores value, unit, time, user, equipment ID and optional image. | M |
| FR-WHY-07 | Sampling: sample ID, sampling date/time, lab, result and reference when available; a lab result can be attached after the decision. | M |
| FR-WHY-08 | The system evaluates measurements against the active threshold set and shows a suggested outcome, but the user selects the decision. | M |
| FR-WHY-09 | Decision options: **Accepted**, **Hold**, **Rejected**, with reason, decision time, checker, authenticated sign-off and evidence. | M |
| FR-WHY-10 | Accepting a lot whose measurements fall outside thresholds requires a justification and creates a deviation. | M |
| FR-WHY-11 | Rejected lots can never be allocated (**Always blocking**). Held lots cannot be allocated until formally released. | M |
| FR-WHY-12 | **Shelf life \[Added\]:** each accepted lot gets a use-by time computed from generation time plus a configurable maximum age (and storage temperature rule). Expiring lots appear as tasks; expired lots cannot be allocated. | M |
| FR-WHY-13 | **Disposal \[Added\]:** rejected, expired or leftover whey can be recorded as disposed or diverted (e.g. animal feed) with quantity and method, so mass balance closes. | M |
| FR-WHY-14 | Whey stored before use records storage location and temperature checks if required by the SOP. | S |

### 7.6 Material allocation and mass balance (ALC)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-ALC-01 | Allocations record input lot → output batch → quantity, unit, time and user. | M |
| FR-ALC-02 | One whey lot may be split across batches; a batch may use several whey lots where the SOP allows (configurable). | M |
| FR-ALC-03 | The system computes per whey lot: received, accepted, rejected, on hold, allocated, disposed, remaining, valorized. | M |
| FR-ALC-04 | Allocation exceeding available quantity is blocked online; offline, it is accepted provisionally and resolved on sync (see section 10). | M |
| FR-ALC-05 | The same logic applies to ingredient lots (bulgur, salt, others) and packaging material lots. | M |
| FR-ALC-06 | **Yield check \[Added\]:** at packaging, the system compares output mass with inputs and flags yields outside a configurable expected range. | S |
| FR-ALC-07 | Closing a whey lot with a residual quantity requires recording what happened to it (disposed, lost, measurement difference). | S |

### 7.7 Kishk production batch and lifecycle (BAT)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-BAT-01 | Creating a batch generates Batch ID, cooperative, producer, creation time, status, SOP version and traceability reference. | M |
| FR-BAT-02 | The producer links accepted whey lot(s) and selects ingredient lots (bulgur, salt, optional) with quantities and units. | M |
| FR-BAT-03 | Ingredient photos are optional or required per configuration, not universally mandatory. | M |
| FR-BAT-04 | Lifecycle states: **Draft → In Production → Awaiting Review → Released**, with **On Hold**, **Rejected**, **Withdrawn/Recalled** and **Closed**. | M |
| FR-BAT-05 | All state transitions are recorded in the audit log with user, time and reason. | M |
| FR-BAT-06 | A batch cannot become Released while unresolved critical deviations exist (**Always blocking**). | M |
| FR-BAT-07 | **Production stages \[Added\]:** within In Production, the batch moves through configurable stages (e.g. preparation, mixing, fermentation, drying, grinding/sieving, ready to pack), each with its own checkpoints and expected duration. | M |
| FR-BAT-08 | **Multi-day tracking \[Added\]:** stages carry start and end times; elapsed time and overdue stages are visible and drive reminders. | M |
| FR-BAT-09 | **Handover \[Added\]:** responsibility for a batch can pass between producers; each record keeps its own author. | S |
| FR-BAT-10 | A batch may be abandoned before packaging with a reason; its inputs remain consumed and appear in losses. | M |
| FR-BAT-11 | Closed state is reached when all packaged stock is sold, distributed, or written off. | S |

&#91;embedded content: batch lifecycle · 5 main states, 3 exception states\]

Any active state can move to On Hold; a held batch resumes or is rejected after review.

### 7.8 Pre-production verification and checkpoints (CHK)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-CHK-01 | Pre-production checklist: equipment cleaned and sanitized, area clean, personal hygiene satisfied, ingredients inspected, containers/equipment protected. Items are configurable. | M |
| FR-CHK-02 | Repeated checks use quick interactions: "all OK" with one tap, exceptions recorded individually. | M |
| FR-CHK-03 | Checkpoints are configurable and linked to the active SOP version. Examples: hygiene confirmation, temperature, pH, mixing, fermentation, drying inspection, moisture, appearance, packaging inspection. | M |
| FR-CHK-04 | Each checkpoint definition sets: stage and timing, responsible role, required data and units, acceptable range or response, photo requirement, and whether failure is a warning or critical deviation. | M |
| FR-CHK-05 | The app shows only checks for the current stage, never one long form. | M |
| FR-CHK-06 | **Recurring checks \[Added\]:** checks can repeat on an interval during a stage (e.g. drying inspection every 12 h) and are generated automatically. | M |
| FR-CHK-07 | **Equipment link \[Added\]:** a measurement can record which device was used; using a device past its calibration date raises a warning. | S |
| FR-CHK-08 | **Late entry \[Added\]:** checks recorded after their due time keep both the observed time and the entry time, and are flagged as late. | M |

### 7.9 Tasks, reminders and guidance (TSK)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-TSK-01 | The system determines the next required action for every active batch and lot. | M |
| FR-TSK-02 | Task types include: check due, missing measurement, stage overdue, awaiting review, storage inspection due, whey lot expiring, held lot awaiting decision, training due, calibration due, deviation action due. | M |
| FR-TSK-03 | The producer home screen is a prioritized **"What needs my attention now?"** list, overdue first. | M |
| FR-TSK-04 | Tasks work offline from locally cached schedules. | M |
| FR-TSK-05 | Supervisors see a review queue of batches and lots awaiting their decision. | M |

### 7.10 Deviations and corrective actions (DEV)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-DEV-01 | Out-of-range values automatically create a deviation; users can also raise one manually. | M |
| FR-DEV-02 | A deviation records: affected batch or lot, issue, detected value/condition, time, detector, severity, corrective action, evidence, reviewer, resolution. | M |
| FR-DEV-03 | Severity levels: minor, major, critical; categories are configurable. | M |
| FR-DEV-04 | Critical deviations automatically place the batch or lot **On Hold** pending review. | M |
| FR-DEV-05 | Only a Supervisor/QA or Food-Safety Lead can close a critical deviation, with sign-off. | M |
| FR-DEV-06 | **Preventive action \[Added\]:** a deviation can carry a preventive action with an owner and due date, tracked as a task. | S |
| FR-DEV-07 | **Recurrence \[Added\]:** the system flags repeated deviations of the same category at the same cooperative within a configurable window. | S |
| FR-DEV-08 | **Complaints \[Added\]:** a consumer or customer complaint can be logged against a packaging lot and converted into a deviation. | S |

### 7.11 Batch status indicators (STS)

A single numerical "compliance score" is not used to imply safety. Each batch shows separate indicators.

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-STS-01 | **Record completeness:** percentage of required records completed, e.g. "92% of required production records completed". | M |
| FR-STS-02 | **Process status:** On Track, Attention Required, On Hold, Released, Rejected. | M |
| FR-STS-03 | **Deviations:** counts by severity and resolution, e.g. "0 critical, 2 minor resolved". | M |
| FR-STS-04 | **Training/SOP validity:** whether the producer held required training for the SOP version used. | M |
| FR-STS-05 | Any internal numeric score is labeled as a process/completeness indicator and never as food-safety certification. | C |

### 7.12 AI-assisted evidence capture (AI)

AI is a data-entry assistant. Workflow: **photo → AI proposes value → user confirms or corrects → value stored.**

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-AI-01 | OCR reading of thermometer, pH meter and scale displays, package labels and printed lot numbers. | S |
| FR-AI-02 | The system keeps the original image, extracted value, confidence, and final confirmed value. | S |
| FR-AI-03 | Below a configurable confidence threshold the field stays empty and requires manual entry. | S |
| FR-AI-04 | **Offline fallback \[Added\]:** when no model is available offline, the photo is stored and the user enters the value manually; OCR can run later as a cross-check. | S |
| FR-AI-05 | **Monitoring \[Added\]:** WISE can see the rate at which users correct AI values, per field type, to judge accuracy. | C |
| FR-AI-06 | Appearance analysis by computer vision is experimental decision support only and never releases or rejects product. | P2 |

### 7.13 Packaging and labeling (PKG)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-PKG-01 | Recording packaging creates a Packaging Lot linked to its batch: date/time, packaging type, packaging material lot, package size, number of packages, total packaged mass, responsible producer. | M |
| FR-PKG-02 | Packaging types (kraft pouch, transparent food-grade pouch, vacuum pouch, plastic container, custom) and sizes (250 g, 500 g, 1 kg, custom) are admin-maintained lists. | M |
| FR-PKG-03 | A batch may be packaged in several sessions, each creating its own packaging lot. | M |
| FR-PKG-04 | **Best-before \[Added\]:** each packaging lot gets a best-before date from a configurable shelf life per product and package type; the user can shorten but not extend it. | M |
| FR-PKG-05 | **Label data \[Added\]:** the system assembles mandatory label content: product name, ingredients, allergens (milk; gluten from bulgur), net weight, cooperative, lot code, production date, best-before, storage instructions and QR. Final label rules are set by the Food-Safety Lead (see section 9). | M |
| FR-PKG-06 | **Label printing \[Added\]:** print-ready label sheets (PDF, A4 sticker sheets) and support for a small Bluetooth thermal label printer. | S |
| FR-PKG-07 | Packaging completion moves the batch to Awaiting Review; it never implies release. | M |

### 7.14 Storage and inventory (INV)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-INV-01 | Finished stock records storage location, quantity, storage date and storage requirements. | M |
| FR-INV-02 | Periodic storage inspections: clean, dry, pest-protected, off-floor, temperature/humidity if required, photo. | M |
| FR-INV-03 | Inventory is a ledger of movements (produced, sold, distributed, sample, lost, disposed, returned, adjusted), not an editable number. | M |
| FR-INV-04 | The balance **Produced = In stock + Sold/Distributed + Removed/Lost** is checked within a configurable tolerance. | M |
| FR-INV-05 | **Stock count \[Added\]:** periodic physical counts reconcile system stock; differences require a reason. | S |
| FR-INV-06 | **Expiry \[Added\]:** stock nearing best-before appears as a task; expired stock cannot be sold. | M |
| FR-INV-07 | Unreleased stock is visually separated and cannot be sold. | M |

### 7.15 Batch release (REL)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-REL-01 | An authorized user reviews required checkpoints, deviations, measurements, packaging information and quality checks on one review screen. | M |
| FR-REL-02 | Decision options: Release, Hold, Reject; decision, reason and person are permanently recorded with sign-off. | M |
| FR-REL-03 | Release is blocked when required records are missing or critical deviations are unresolved. | M |
| FR-REL-04 | **Separation of duties \[Added\]:** by default the releaser must differ from the producer. Where a cooperative has only one qualified person, a configurable exception allows self-release and flags the batch for WISE remote review. | M |
| FR-REL-05 | **Pending lab results \[Added\]:** if the SOP requires a lab result before release, release is blocked until it is attached. | S |
| FR-REL-06 | Release and rejection lock the batch; later changes are amendments with reason. | M |

### 7.16 QR codes and public page (QR)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-QR-01 | Batch-level traceability by default: all packages of a packaging lot share one QR. | M |
| FR-QR-02 | The QR encodes a persistent short URL with an opaque token, not the record itself. | M |
| FR-QR-03 | The design keeps open a later move to GS1 Digital Link or other standard identifiers. | M |
| FR-QR-04 | Public page shows: product name, cooperative, production date, lot number, ingredients, allergens, package size, best-before, storage advice, WISE project information, circular-economy story. | M |
| FR-QR-05 | Public page shows a status only as "Available" or a withdrawal/recall notice; it never claims QR registration proves safety. | M |
| FR-QR-06 | The page never shows internal measurements, producer personal data, deviations, commercial data, supplier-sensitive data or audit records. | M |
| FR-QR-07 | Arabic and English with automatic language detection and a toggle; loads in under 2 s on 3G and works without login. | M |
| FR-QR-08 | **Unreleased lot \[Added\]:** scanning a QR of an unreleased or rejected lot shows a neutral "information not available" page. | M |
| FR-QR-09 | **Feedback \[Added\]:** optional "report a problem" form feeds the complaints log (FR-DEV-08). | S |
| FR-QR-10 | Scan counts per lot are recorded anonymously for engagement indicators. | C |

Example narrative: *Produced through the WISE initiative using dairy whey as an input for traditional kishk production, supporting the productive use of a dairy by-product.*

### 7.17 Withdrawal and recall (RCL)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-RCL-01 | Authorized users can place a released batch or packaging lot into Withdrawn/Recalled with reason and sign-off. | M |
| FR-RCL-02 | Trace-forward from a batch immediately lists: source whey lot(s), other batches sharing those lots, packaged quantities, remaining inventory, recorded sales/distribution, affected cooperatives. | M |
| FR-RCL-03 | Trace-forward from a whey lot or ingredient lot lists every downstream batch, packaging lot, stock and sale with quantities. | M |
| FR-RCL-04 | The public QR page of affected lots switches to a configurable withdrawal/recall notice. | M |
| FR-RCL-05 | **Recall case \[Added\]:** each recall is a case with scope, actions (stop sale, notify buyers, retrieve, destroy), quantities recovered, status and closure. | M |
| FR-RCL-06 | **Notification list \[Added\]:** the case lists buyer categories and recorded customer contacts (where collected) to notify. | S |
| FR-RCL-07 | **Mock recall \[Added\]:** a simulation mode runs the same trace without changing statuses or public pages, timed for drills. | M |
| FR-RCL-08 | Recall initiation alerts Supervisors, Coop Managers, WISE Admin and Food-Safety Lead immediately. | M |

### 7.18 Sales and distribution (SAL)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-SAL-01 | A lightweight record captures packaging lot, date, quantity, package size, transaction type, destination/customer category, unit price or total, and currency. | M |
| FR-SAL-02 | Transaction types: sale, consignment, donation/sample, internal use, return. | M |
| FR-SAL-03 | **Currency \[Added\]:** LBP and USD supported; exchange rate stored per transaction for consistent USD reporting. | M |
| FR-SAL-04 | Only released, unexpired stock can be sold; sales cannot exceed available stock. | M |
| FR-SAL-05 | Customer identity is not required; optional named customer only for B2B buyers when needed for recall. | M |
| FR-SAL-06 | **Quick sale \[Added\]:** scanning a package QR pre-fills lot and size for a two-tap entry. | S |

### 7.19 Equipment and calibration (EQP)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-EQP-01 | Records for thermometer, scale, pH meter, moisture meter, temperature/humidity logger: device ID, cooperative, type, calibration/check date, next due, status. | M |
| FR-EQP-02 | Simple verification checks (e.g. thermometer in ice water, scale with reference weight) can be recorded in the app. | S |
| FR-EQP-03 | Calibration due dates generate tasks; out-of-date devices trigger warnings when used. | M |
| FR-EQP-04 | Other equipment (containers, utensils, mesh covers, PPE, cleaning supplies, QR labels) stays in training and SOP material, not the software. | M |

### 7.20 Administrative configuration (CFG)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-CFG-01 | Admins manage cooperatives, users and roles, suppliers, ingredient types, packaging options, SOP versions, training modules, checkpoints, units, thresholds, deviation categories, shelf-life rules, label templates and KPI definitions. | M |
| FR-CFG-02 | **Two-step approval \[Added\]:** changes to food-safety thresholds, checkpoints and SOPs are drafted by an Admin and approved by the Food-Safety Lead before taking effect. | M |
| FR-CFG-03 | Configuration is versioned with effective dates; active batches keep the version they started under unless an admin migrates them with a reason. | M |
| FR-CFG-04 | Configuration can be scoped globally or per cooperative where procedures differ. | S |
| FR-CFG-05 | Configuration can be exported and imported as a file to set up new cooperatives or environments. | S |

### 7.21 Data quality controls (DQ)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-DQ-01 | Prevent or warn on: impossible dates, negative quantities, allocation over available, duplicate IDs, missing required records, unsupported units, sales over stock, use of rejected/held/expired whey, release with critical deviations. | M |
| FR-DQ-02 | Each rule is configurable as blocking or warning, except those marked Always blocking. | M |
| FR-DQ-03 | **Plausibility ranges \[Added\]:** measurements far outside physical plausibility (e.g. pH 14) prompt re-entry before saving. | M |
| FR-DQ-04 | **Data-quality report \[Added\]:** admins see warnings overridden, late entries and sync conflicts by cooperative. | S |

### 7.22 Audit trail (AUD)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-AUD-01 | Every create, change and state transition on critical records writes an append-only audit event: object, field, old value, new value, user, device, time, reason. | M |
| FR-AUD-02 | Corrections require a reason; originals remain visible in history. | M |
| FR-AUD-03 | Released, rejected and recalled records are locked; changes are amendments. | M |
| FR-AUD-04 | The audit log cannot be edited or deleted by any role, including admins. | M |
| FR-AUD-05 | Audit history is viewable per record and exportable. | M |

### 7.23 Reporting and export (RPT)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-RPT-01 | Export to CSV, Excel and PDF, respecting the user's access scope. | M |
| FR-RPT-02 | Reports: whey reception register, batch traceability, batch production record, deviations, inventory, sales, training, impact indicators, trace-back/recall, equipment calibration, audit log. | M |
| FR-RPT-03 | One batch traceability report reconstructs the full history from incoming whey to finished product and sale. | M |
| FR-RPT-04 | **Scheduled reports \[Added\]:** monthly impact and operations reports emailed to configured recipients. | S |

### 7.24 Notifications (NTF)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-NTF-01 | In-app notifications for tasks, reviews, deviations and recalls. | M |
| FR-NTF-02 | **Critical alerts \[Added\]:** recall, critical deviation and expiring held whey also go by WhatsApp or SMS, with user opt-in. | S |
| FR-NTF-03 | Web push where the device supports it. | S |

## 8. Dashboards, KPIs and KPI dictionary

Three dashboards read the same records at different levels of aggregation. All filter by date, cooperative, region, product and batch status where the viewer's scope allows. Each tile links to its KPI definition.

### 8.1 Cooperative operational dashboard

Purpose: **action**, not presentation. Audience: Supervisor/QA and Coop Manager.

- **Current operations:** active batches by stage, batches requiring action, batches on hold, recent whey deliveries, material awaiting decision, whey lots expiring soon.
- **Production:** whey received, used, disposed; kishk produced; packaged quantity; inventory; quantity sold.
- **Quality:** missing checks, open deviations, rejected whey lots, held/rejected batches, upcoming inspections, training and calibration due.

### 8.2 WISE project management dashboard

Audience: WISE Admin, Food-Safety Lead, Project/Technical Partner.

- **Participation:** registered and active cooperatives, trained and active producers.
- **Traceability and production:** whey receipts, accepted/rejected whey, whey allocated, batches produced, packaged production, by cooperative and region.
- **Process and quality:** record completeness, open deviations, holds, rejections, recurring deviation categories, training status, late-entry and override rates \[Added\], sync health per cooperative \[Added\].
- **Commercialization:** packaged, sold/distributed, recorded sales value, inventory.

### 8.3 Impact dashboard

Audience: WISE management, donors, policymakers. Aggregated data only; any cell representing fewer than 5 individuals is suppressed \[Added\].

**Environmental / circular economy**

- Whey received, whey accepted, whey valorized (accepted whey allocated to completed batches).
- Whey utilization rate and kishk output per kg of whey (formulas below).
- Valorized whey is **not** labeled "waste diverted from disposal" unless WISE documents that disposal was the counterfactual.
- Avoided CO₂ is shown only once WISE adopts and documents a methodology and emission factor.

```latex
\text{Whey utilization rate} = \frac{\text{Whey used in completed batches}}{\text{Accepted whey received}} \times 100
```

```latex
\text{Kishk output per kg whey} = \frac{\text{Finished packaged kishk mass}}{\text{Whey input mass}}
```

The second is a production yield ratio, not "conversion efficiency", because kishk contains other raw materials.

**Economic**

- Quantity commercialized, number of transactions, recorded gross sales, average selling price, participating sellers/cooperatives, sales by region, product and package type.
- Revenue is never labeled income or profit. Income or profitability requires a defined methodology and cost data (Phase 2).

**Social**

- Participating cooperatives, registered producers, trained producers, active producers, participating women, training completion, jobs supported only where a defined methodology exists.
- "Beneficiary", "active producer" and "job supported" must have approved definitions before appearing as official indicators.

**Policy / scaling**

- Share of active producers using digital traceability, share completing required checks, cooperatives implementing the WISE procedure, regional coverage, sustained production activity, recurrence of major deviations, commercialization activity.
- "Scaling potential" is not presented as a computed fact unless WISE defines a scoring methodology.

### 8.4 KPI dictionary

Every dashboard metric has one formal definition stored in the system (FR-CFG-01) and in project documentation. Two dashboards can never show the same label calculated differently. Starter set, to be confirmed by WISE M&E:

| KPI ID | KPI | Definition | Source | Calculation | Exclusions | Visibility |
| --- | --- | --- | --- | --- | --- | --- |
| KPI-01 | Whey received (kg) | Mass of whey recorded at receipt | Whey lots | Sum received mass | Test data | Coop, project, donor |
| KPI-02 | Whey accepted (kg) | Mass with decision Accepted | Whey lots | Sum where decision = Accepted | Lots later reclassified by amendment use latest decision | Coop, project, donor |
| KPI-03 | Whey valorized (kg) | Accepted whey consumed by batches that reached Released | Allocations | Sum allocations to released batches | Abandoned or rejected batches | Project, donor |
| KPI-04 | Whey utilization rate (%) | KPI-03 ÷ KPI-02 | Derived | Ratio × 100 | — | Project, donor |
| KPI-05 | Kishk packaged (kg) | Net mass in packaging lots | Packaging lots | Sum packaged mass | Rejected batches | Coop, project, donor |
| KPI-06 | Kishk output per kg whey | KPI-05 ÷ whey input to the same batches | Derived | Ratio | Batches without complete allocation | Project |
| KPI-07 | Active producer | Producer recording at least one qualifying activity in the period | Production records | Distinct qualified users | Test and deactivated accounts | Project, donor (aggregate) |
| KPI-08 | Trained producer | Producer with all required current modules completed | Training completions | Distinct users | Expired refreshers | Project, donor |
| KPI-09 | Record completeness (%) | Required records completed ÷ required records due | Checkpoints | Ratio across batches in period | Draft batches | Coop, project |
| KPI-10 | Recorded gross sales (USD) | Value of sale transactions | Sales | Sum of totals converted at stored rate | Donations, returns | Coop, project, donor |
| KPI-11 | Units sold | Packages in sale transactions | Sales | Sum quantity | Returns | Coop, project, donor |
| KPI-12 | Open critical deviations | Critical deviations not closed | Deviations | Count at period end | — | Coop, project |
| KPI-13 | Mock-recall time (min) | Time to complete a mock recall trace | Recall cases | Duration | — | Project |

## 9. Food safety and regulatory alignment \[Added\]

The software encodes a food-safety protocol; it does not create one. Thresholds, checkpoints and release criteria must come from a validated WISE protocol owned by a named Food-Safety Lead.

- **Hazard analysis.** WISE completes a HACCP-style hazard analysis for whey-based kishk (aligned with Codex general principles of food hygiene). Each critical control point maps to a configured checkpoint marked critical, with its critical limit, monitoring, corrective action and verification.
- **Likely control points to validate** (for the Food-Safety Lead to confirm, not prescribed here): whey acceptance (acidity, temperature, time since generation), fermentation acidity, drying endpoint (moisture or water activity), foreign matter at sieving/packaging, storage conditions.
- **Regulatory references.** The Food-Safety Lead confirms applicable Lebanese requirements, including the Food Safety Law (Law 35/2015) and relevant LIBNOR standards for kishk and labeling, and any registration needed for cooperatives selling packaged food. The platform's label template and record retention follow that review.
- **Labeling.** Mandatory label elements and allergen declarations are configured from that review (FR-PKG-05). The QR page is supplementary and never replaces mandatory on-pack information.
- **Record retention.** Production and traceability records are kept for at least shelf life plus a configurable margin, and no less than the period required by applicable law or donor agreements (default 5 years, to be confirmed).
- **Validation of the platform.** Before pilot go-live, the Food-Safety Lead signs off the configured checkpoints, thresholds and release rules against the approved protocol.
- **Disclaimers.** The platform, its scores and the QR page never state or imply that a product is certified safe.

## 10. Offline operation and synchronization

Producers must be able to record work offline and sync later. Because offline devices cannot see each other's changes, every action is classified by whether it is safe offline. \[Added: explicit sync rules\]

### 10.1 Action classes

| Class | Actions | Offline behaviour |
| --- | --- | --- |
| Offline-safe | Checkpoint records, measurements, photos, notes, pre-production checklist, storage inspections, raising a deviation, training progress | Saved locally, synced later; never conflicts because each record is new and append-only |
| Offline-provisional | Whey receipt, ingredient receipt, batch creation, allocation, packaging, sales | Saved locally with provisional status; server validates on sync and may flag a conflict |
| Online-only | Accept/reject decision on whey that will be allocated by another device, batch release/reject, recall, closing critical deviations, configuration changes, user management | Requires connection; the button explains why it is unavailable offline |

Whey Accept/Hold/Reject may be recorded offline when the same device will also perform the allocation (common in small cooperatives); the decision is provisional until synced and cannot be overridden silently.

### 10.2 Sync rules

- Records carry a device-generated UUID, author, device and both observed time and recorded time.
- Sync is incremental and resumable on poor connections; photos upload separately after structured data, compressed on device.
- Status per record is always visible: **saved on device**, **syncing**, **synced**, **conflict**.
- A banner shows time since last successful sync; after a configurable period (default 24 h) supervisors are alerted.
- **Conflict handling:** the server never discards data. Over-allocation, sale over stock or use of a lot that became held elsewhere creates a sync conflict task for the Supervisor, who resolves it by adjusting quantities or raising a deviation.
- Edits to the same record from two devices keep both versions in history; the later server receipt is shown, the other flagged.
- Before going offline, the device caches the reference data it needs: active lots, suppliers, checkpoints, thresholds, training content, users of the cooperative.
- Local storage is encrypted where the platform allows, and wiped on remote device revocation.

### 10.3 Device and power realities

- Target devices: Android 10+ mid-range phones with 3 GB RAM and camera; iOS supported.
- The app must tolerate being killed by the OS or a dead battery without losing saved records.
- Data use is minimized: target under 20 MB per producer per week excluding video training.

## 11. UX, accessibility and localization

The producer experience is designed for smartphones first; supervisor and admin screens work on phone and desktop.

### 11.1 Producer UX

- Large touch targets (minimum 48 × 48 dp), high-contrast theme readable in sunlight, one-handed use.
- Minimal typing: selections, defaults, steppers for numbers, scanning, photo capture, automatic timestamps.
- Home screen = "What needs my attention now?"; each task opens directly at the right step.
- Icons and photos accompany every option so the app is usable with limited literacy \[Added\].
- **Voice notes \[Added\]:** a producer can attach a short voice note to any record or deviation instead of typing. (S)
- Clear confirmation after each save, with the sync status icon.
- Undo within a short window for non-critical entries; after that, corrections follow the audit rules.

### 11.2 Localization

- All interface text lives in translation files from day one; nothing is hard-coded in components.
- Arabic and English at launch, with full right-to-left layout, mirrored navigation and correct handling of mixed Arabic/Latin text (lot codes, units).
- Lebanese-appropriate Arabic wording, reviewed with producers during design testing \[Added\].
- Numbers default to Western Arabic digits with an option for Eastern Arabic digits; dates show day-month-year; times use the Asia/Beirut zone and are stored in UTC.
- Additional languages (e.g. French) can be added without redesign.

### 11.3 Accessibility

- Target WCAG 2.1 AA for supervisor, admin and public pages.
- Screen-reader labels on all controls; colour is never the only signal of status.

### 11.4 Usability validation \[Added\]

- Paper and clickable prototypes tested with at least 6 producers from 2 cooperatives before build of producer flows.
- A second round on the working app before the pilot.

## 12. Security, privacy and data governance

### 12.1 Security

- Secure authentication, role-based access, cooperative-level data isolation enforced in the database layer (e.g. row-level security), not only in the API.
- Stronger authentication (second factor) for WISE Admins and Food-Safety Leads.
- Authenticated approvals: release, rejection, recall and acceptance-criteria changes always identify the responsible account.
- TLS for all traffic; encryption at rest for database and media storage.
- Media (photos, voice notes) stored privately and served via short-lived signed URLs; never publicly listable.
- Session management, account disabling and device revocation (FR-AUTH-05 to 07).
- Administrative actions logged in the audit trail.
- Automated daily backups with at least 30 days retention, an off-site copy, and a tested restore at least quarterly \[Added\].
- Dependency and vulnerability scanning in the build pipeline; a security review before pilot go-live \[Added\].
- Rate limiting and bot protection on public QR pages and sign-in \[Added\].

### 12.2 Privacy

- Collect only information required for operational or project objectives.
- Public and internal traceability are different views of the same data, built from an explicit public field allow-list.
- Demographic data for impact is stored separately, accessed only by authorized roles, and never publicly linked to individual producers.
- Aggregated donor and policymaker views suppress small groups (fewer than 5) to prevent identification.
- **Consent \[Added\]:** producers are told in plain Arabic what is collected and why; demographic fields need recorded consent and can be withdrawn.
- **Photo guidance \[Added\]:** producers are trained to avoid capturing faces; images are not used to identify people.
- **Data subject requests \[Added\]:** a producer leaving the program can have personal data anonymized while production records keep a pseudonymous author ID.

### 12.3 Data governance and ownership \[Added\]

- **Ownership:** each cooperative owns its operational data; WISE holds a licence to use it for project monitoring and aggregated reporting. To be confirmed in data-sharing agreements signed at onboarding.
- **Access by donors and partners** is limited to aggregated indicators unless a cooperative agrees otherwise.
- **Export right:** a cooperative can export all its data in open formats at any time.
- **Data hosting:** location and provider chosen with AUB/ESDU and donor requirements in mind (see section 16).

## 13. Non-functional requirements \[Added\]

Sizing assumptions to be confirmed by WISE: up to 30 cooperatives, 300 users, 2,000 batches and 3,000 whey lots per year, about 20 photos per batch.

| ID | Area | Requirement |
| --- | --- | --- |
| NFR-01 | Performance | Producer screens open in under 1 s from local data; online API p95 under 500 ms. |
| NFR-02 | Performance | Trace-back and trace-forward reports in under 10 s for any lot. |
| NFR-03 | Public page | QR page first load under 2 s on 3G; under 300 KB excluding product photo. |
| NFR-04 | Availability | 99.5% monthly for online services; offline recording unaffected by outages. |
| NFR-05 | Durability | No loss of a record once the device shows "saved on device". |
| NFR-06 | Recovery | Recovery point objective 24 h, recovery time objective 8 h. |
| NFR-07 | Scalability | Architecture supports 10× the sizing assumption without redesign. |
| NFR-08 | Storage | Photos compressed on device to about 300 KB; originals kept only when OCR needs them. |
| NFR-09 | Compatibility | Latest two versions of Chrome, Safari, Samsung Internet; Android 10+ and iOS 15+. |
| NFR-10 | Localization | 100% of UI strings externalized; RTL layout passes visual review on all screens. |
| NFR-11 | Accessibility | WCAG 2.1 AA on supervisor, admin and public pages. |
| NFR-12 | Security | No high or critical findings open at go-live. |
| NFR-13 | Auditability | Every critical record reconstructable to any past point in time. |
| NFR-14 | Maintainability | Automated tests cover lifecycle rules, allocation, sync conflicts and permissions; CI runs on every change. |
| NFR-15 | Observability | Error tracking on client and server; sync failures per device visible to admins. |
| NFR-16 | Cost | Hosting under an agreed monthly budget at pilot scale (see section 16). |

## 14. Reference technical architecture \[Added\]

The recommended shape is an offline-first progressive web app over one relational database, with the public QR page served from a separate read-only projection. Final technology choices are confirmed in the technical design document.

&#91;embedded content: reference architecture · 3 clients, 4 services, 3 stores\]

Producers work mostly from local data and sync both ways; the public page only reads allow-listed, cached fields, so internal records are never exposed.

### 14.1 Components

- **Producer PWA:** installable web app with a local database (IndexedDB) holding cached reference data and an outbox of unsynced records; camera, QR scanning and photo compression on device.
- **Supervisor and admin web:** same codebase, responsive, desktop-friendly for review, configuration and dashboards.
- **API and sync service:** authentication, authorization, validation of every incoming record against the rules that applied at its observed time, conflict detection.
- **Rules engine:** evaluates configurable checkpoints, thresholds, lifecycle transitions and data-quality rules from versioned configuration, never from hard-coded values.
- **Tasks and alerts:** scheduled jobs generate due checks, expiry and calibration tasks, and send critical alerts.
- **Reports and KPIs:** genealogy queries for trace-back/forward and recall; KPI values computed from database views that implement the KPI dictionary.
- **PostgreSQL:** relational store with row-level security for cooperative isolation, recursive queries for lot genealogy and an append-only audit table.
- **Private media storage:** S3-compatible object storage, accessed by signed URLs.
- **Public projection:** a minimal set of public fields per packaging lot, cached at the edge for fast QR loads.

### 14.2 Design notes

- Candidate sync approaches (custom outbox protocol or an established Postgres sync library) are compared in the technical design against the action classes in section 10.
- OCR runs server-side in the MVP, with an on-device model evaluated for offline use.
- All configuration is data with version and effective date, so the rules engine can re-evaluate any record against the version it used.
- Environments: development, staging with anonymized data, production.
- Infrastructure is defined as code to support the handover in section 16.

## 15. Rollout, pilot, training and support \[Added\]

The integrated MVP goes live first with two pilot cooperatives, then expands once pilot exit criteria are met.

1. **Discovery and protocol.** Site visits, current paper records, hazard analysis and approved SOP v1; KPI definitions agreed.
2. **Design.** Data model, producer flow prototypes tested with producers, label template.
3. **Build.** All MVP modules on one data model, with fortnightly demos to WISE.
4. **Validation.** Food-Safety Lead signs off configuration; security review; usability round two.
5. **Pilot (8–12 weeks).** Two cooperatives, paper records kept in parallel for the first 4 weeks as fallback; weekly check-ins.
6. **Mock recall drill.** At least one timed mock recall per pilot cooperative.
7. **Scale-out.** New cooperatives onboarded in waves with a standard onboarding pack.

**Pilot exit criteria:** the targets in section 2.4 met, no open critical defects, Food-Safety Lead approval.

**Onboarding pack per cooperative:** data-sharing agreement, user accounts, device setup, configured suppliers, equipment records, label stock, in-person training (half day) plus in-app modules.

**Support:** a named WISE field officer per cooperative, a WhatsApp support line, in-app "help" with short videos, and a bug and feedback log reviewed weekly during the pilot.

## 16. Sustainability, hosting and ownership after the project \[Added\]

The platform must keep running after WISE funding ends, so its operating owner and costs are decided before build, not at close-out.

- **Operating owner:** a named institution (e.g. ESDU, a cooperative union or a partner organization) responsible for hosting, support and updates after the project. To be decided.
- **Running cost:** a monthly budget for hosting, storage, messaging (SMS/WhatsApp) and domain, estimated at pilot and at full scale, with a funding source for at least 24 months beyond the project.
- **Technology choices** favour widely known open-source components and managed services so a different team can maintain them.
- **Handover package:** source code in an organization-owned repository, infrastructure-as-code, admin and developer documentation, configuration export, and a runbook for backups, restores and incident response.
- **Exit plan:** if the platform is retired, each cooperative receives a full export of its data and printable batch records.
- **Licensing:** code licence and IP ownership agreed between WISE partners and the developer up front.

## 17. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Producers find the app slower than paper and stop recording | Gaps in traceability and KPIs | Photo- and tap-first flows, shared-device PIN switching, usability testing with producers, field officer support |
| Offline conflicts on allocation and stock | Wrong mass balance, trace errors | Action classes and conflict tasks (section 10), server-side validation, sync health monitoring |
| Food-safety protocol not validated before build | Wrong thresholds encoded | Configurable rules plus Food-Safety Lead sign-off gate before pilot |
| Sales recorded incompletely (informal or cash sales) | Under-reported economic impact | Quick-sale scanning, stock reconciliation flags unrecorded outflows, KPIs labeled "recorded" |
| Integrated MVP scope slips | Late pilot | Single data model, fortnightly demos, clear MoSCoW within modules so S/C items can move without breaking integration |
| OCR misreads values | Wrong measurements stored | Mandatory human confirmation, confidence threshold, correction-rate monitoring |
| Shared phones and weak passwords | Misattributed records | Personal PINs, re-entry for critical actions, device revocation |
| Connectivity and power outages | Delayed dashboards | Offline-first design, "near-real-time" framing, sync alerts |
| No operating owner after funding | Platform abandoned | Section 16 decided before build |
| Impact claims challenged by evaluators | Credibility loss | KPI dictionary, counterfactual rules, no unsupported CO₂ or income claims |
| Public page leaks private data | Privacy breach | Public allow-list projection, review in security testing |

## 18. Open decisions

- [ ] Who is the named Food-Safety Lead, and when will the validated protocol (SOP v1, thresholds, critical control points) be ready?
- [ ] May one batch use whey from several lots, and may batches be blended or reworked?
- [ ] Maximum whey age at acceptance and before use; storage temperature rule.
- [ ] Shelf life per package type, and the label template after regulatory review.
- [ ] Is a lab result required before release, and for which tests?
- [ ] Can a single qualified person both produce and release at small cooperatives?
- [ ] Approved definitions for beneficiary, active producer and job supported.
- [ ] Counterfactual for whey (was it disposed of, fed to animals, other?) and whether a CO₂ methodology will be adopted.
- [ ] Which customer categories are recorded, and do B2B buyers need names for recall?
- [ ] Are WhatsApp/SMS alerts in budget, and which provider?
- [ ] Operating owner, hosting location and post-project budget.
- [ ] Code licence and IP ownership.
- [ ] Pilot cooperatives and start date.
- [ ] Confirm sizing assumptions in section 13.

## 19. Glossary

| Term | Meaning |
| --- | --- |
| Whey lot | One received whey delivery with its own ID and decision |
| Ingredient lot | One receipt of bulgur, salt, other ingredient or packaging material |
| Kishk batch | One production run, from mixing to ready-to-pack |
| Packaging lot | Packages from one batch produced in one packaging session; carries the QR |
| Allocation / consumption | Record of an input lot used by an output lot, with quantity |
| Trace-back | From a product to its inputs |
| Trace-forward | From an input to every product and sale that used it |
| Deviation | A condition outside an accepted range or procedure |
| CAPA | Corrective and preventive action |
| Critical control point | Step where control is essential to prevent a food-safety hazard |
| Release | Authorized decision that a batch may be sold |
| Withdrawal / recall | Removing a released product from the market or from consumers |
| Valorized whey | Accepted whey consumed by batches that reached Released |
| Near-real-time | Dashboards update as records synchronize, not instantly |
| Mock recall | Timed simulation of a recall without changing live statuses |

## Appendix A. Key user stories and acceptance criteria

**A1. Receive whey (Producer with receiving authorization)**

As a producer, I record a whey delivery so it can be used in production.

- Given a saved dairy supplier, when I start a receipt, then supplier declarations pre-fill and I only confirm or edit them.
- When I enter pH outside the threshold, then the suggested outcome shows Hold or Reject and accepting requires a justification that creates a deviation.
- When I choose Rejected, then the lot never appears in allocation lists, on any device, after sync.

**A2. Start a batch offline (Producer)**

- Given I completed required training, when I create a batch with no signal, then it saves with status "saved on device" and shows the first stage's checks.
- When I allocate 40 kg from a lot showing 35 kg available locally, then I see a warning and must enter a reason; on sync a conflict task goes to the supervisor.

**A3. Record a drying check**

- Given a batch in the drying stage with a 12-hour check interval, when the check becomes due, then it appears at the top of my home screen.
- When I photograph the thermometer, then the app proposes a value and I confirm it in one tap; the photo, AI value and confirmed value are all stored.

**A4. Release a batch (Supervisor/QA)**

- Given a packaged batch with one open critical deviation, when I open the review screen, then Release is disabled and the blocking reason is shown.
- Given all records complete and no open critical deviations, when I release and re-enter my PIN, then the batch locks and its QR page becomes Available.
- Given I produced this batch myself, then release is blocked unless the self-release exception is enabled, and if used the batch is flagged for WISE review.

**A5. Recall from a whey lot (Food-Safety Lead)**

- Given a whey lot later found contaminated, when I open trace-forward, then I see within 10 seconds every batch, packaging lot, stock quantity and sale linked to it.
- When I start a recall on those lots, then their public QR pages show the recall notice and all relevant roles are alerted.
- When I run the same trace in mock-recall mode, then no status or public page changes and the duration is recorded.

**A6. Consumer scan**

- Given a released lot, when a consumer scans the QR, then the page loads in their phone's language with product, cooperative, lot, best-before, allergens and WISE story, and no internal data.
- Given an unreleased lot, then the page shows "information not available".

**A7. Donor report (Donor viewer)**

- Given a date range, when I open the impact dashboard, then each indicator shows its definition on tap, and any group of fewer than 5 producers is suppressed.
