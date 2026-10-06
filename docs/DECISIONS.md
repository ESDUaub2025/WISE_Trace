# Decisions and unresolved validation

- 2026-10-06: PRD specifies what ships; master prompt fixes stack. All M/S are required; no requirement is marked complete merely because a generic page exists.
- Username accounts map server-side to internal `username@users.wise.invalid` email identifiers. Supabase password auth accepts email/phone, not arbitrary usernames: https://supabase.com/docs/guides/auth/passwords . Admin-created users are confirmed server-side; producers need no email inbox.
- TOTP uses Supabase MFA and AAL2 enforcement: https://supabase.com/docs/guides/auth/auth-mfa . Plan availability must be checked before hosted deployment.
- Public Vite entry lives at `p/index.html` to produce `/p/`: https://vite.dev/guide/build . No top-level 404 is created.
- Dexie transactions must not contain unrelated awaited network work: https://dexie.org/docs/Dexie/Dexie.transaction() . Commit local record/outbox together and send outside transaction.
- Food-safety seed configuration is `PLACEHOLDER — pending Food-Safety Lead approval`; no values constitute validated food-safety advice. Approval, legal label review and field usability tests remain deployment gates.
- Multi-lot enabled; blending/rework disabled; required release lab off; self-release off. These are configuration, not fixed safety thresholds.
- USD/LBP supported with each transaction's recorded exchange rate. No inferred historical market rates.
- OCR is disabled until a secret and configured model exist; no fake readings. External messages use a log provider. Recipient setup is required for scheduled report delivery.
- No code licence is selected without ownership agreement. Demo records use fictional names.

## Exact seeded defaults awaiting approval

Every food-safety value in this table is **PLACEHOLDER — pending Food-Safety Lead approval**. The persistent banner remains while a placeholder configuration is active.

| Setting | Fictional development default |
| --- | --- |
| Maximum whey age from generation | 48 hours |
| Reception pH range | 4–6 |
| Reception temperature range | 0–10 °C |
| Drying inspection acceptable temperature | 10–50 °C |
| Drying reading plausibility bounds | −20–150 °C |
| Recurring drying check | Every 12 hours |
| Shelf life, each seeded package type | 180 days |
| Expected yield range | 0.1–2 kg output / kg input; warning integration remains pending |
| Product label | Whey kishk; whey/bulgur/salt; milk/gluten; keep cool and dry |

Operational defaults: multiple whey lots permitted; blending disabled; self-release disabled; laboratory results before release disabled; session inactivity 30 minutes; offline reauthentication after seven days. All can be changed through versioned configuration. Lab and label requirements need protocol approval before deployment.

The report font is IBM Plex Sans Arabic Regular from the [official IBM repository](https://github.com/IBM/plex/blob/master/packages/plex-sans-arabic/fonts/complete/ttf/IBMPlexSansArabic-Regular.ttf), pinned to Git blob `5e192840f089cf4a92426498715c73184585c344`. Its OFL license is distributed alongside the asset. The initial Arabic-only webfont subset lacked Latin glyphs; the complete font replaces it.

The current dependency audit has two moderate findings in ExcelJS's UUID dependency path and no high/critical findings. An automatic major downgrade is not applied. Recheck before deployment and keep report inputs bounded.

Edge handlers authenticate every caller using Supabase Auth `getUser`, then use that caller's JWT for RLS. The legacy gateway JWT check is disabled for these handlers because it does not support new asymmetric signing keys; anonymous and forged-token calls are tested and denied inside the handler. See [Supabase migration guidance](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys). The scheduler independently requires its configured secret. Server clients support both legacy keys and the new named/default API-key environment maps.

### Versioned learning and private offline media

Training text, illustrated steps, FAQs, troubleshooting and keyed assessments are validated in both languages before publication. Required modules are versioned on SOP approval; current qualifications and configured refresher expiry gate new batches. Existing batches retain help from their original SOP. Uploaded files use a private 10 MB bucket and signed URLs, with per-user offline Blob caches. Browser-native canvas captureStream, MediaRecorder and createMediaStreamDestination compress videos to 640×480 at 15 fps (320 kb/s video, 32 kb/s audio; maximum 180 seconds). Unsupported browsers show an explicit compression error. These APIs were checked against MDN; actual image/video compression and offline playback are exercised in Chromium. Supabase TOTP enrollment and verification are enabled locally and tested with actual AAL2 sessions per its official MFA documentation; the test generator follows RFC 6238. Production training examples remain placeholders until the Food-Safety Lead approves actual procedures.
### Material disposition, labels and notification privacy

Material disposal and diversion debit the append-only inventory ledger. Diversion records a destination; closure requires zero residual stock. Measurement differences require an authorized stock role. Offline overlays show provisional balances until the server confirms them. Packaging yield warnings use the batch's original SOP and accumulated packaging sessions, preserving the justification in a deviation.

Mandatory labels derive exclusively from the batch's approved label template. A4 PDF stickers use browser canvas shaping for Arabic and embedded PNGs. Thermal printing uses an explicitly configured BLE GATT service/characteristic and ESC/POS raster profile; physical printer compatibility remains to be tested. See [MDN Bluetooth requestDevice](https://developer.mozilla.org/en-US/docs/Web/API/Bluetooth/requestDevice) and [Epson raster command](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_lv_0.html).

Broadcast acknowledgments belong to each recipient. Queued acknowledgments persist offline and synchronize under that user's session. External alerts require saved recipient consent and a scoped critical notification. The default provider logs only alert identifiers and reports delivered=false; it never logs phone numbers or contacts recipients. Five failed cached PIN attempts impose a persisted 15-minute lockout. Browser-local protections cannot prevent an attacker controlling the device from modifying its storage.

### Push transport and scoped configuration

Push uses a payload-free request authenticated by native Web Crypto VAPID (RFC 8292), and the worker displays fixed bilingual generic text. Subscription endpoints are private to the recipient and restricted to supported HTTPS push services. The server needs only the endpoint, not the browser's payload-encryption secrets. Failed delivery leases retry; provider acceptance does not prove device display. No VAPID secret is available in frontend code. Cryptographic tests verify tokens independently, check audience/expiry and deny private/redirect destinations. Hosted delivery remains untested without installed subscriptions and deployment keys.

SOP import/export uses a versioned file envelope. Imports re-establish scope, effective date, drafter and separate approval instead of trusting those fields in a file. Global and cooperative versions increment independently. The original batch SOP controls release, including self-release, laboratory evidence and recurring intervals. Structured lab records link sample ID, time, laboratory, reference and outcome; required lab evidence must synchronize before release. Whey receipt quantities use measured kilograms, preventing volume units from silently disappearing from mass indicators.
