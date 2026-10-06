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
