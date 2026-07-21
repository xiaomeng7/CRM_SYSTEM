# Phase 4A — Source-to-V2 Import Transform Design

- Date: 2026-07-18
- Status: **Complete (design + pure transforms + offline tests)**
- Neon fact import: **not started** (Phase 4B — requires explicit approval)
- Production deploy: **forbidden** without separate approval

## Goal

Deterministically map immutable V2.07 workbook (+ approved DEC deltas) into an **ImportPlan IR** that Phase 4B can apply to empty `pos2_*` tables on DEV — without inventing product facts and without writing to Neon in this phase.

## Immutable sources (fingerprint-verified)

| File | Role | SHA-256 |
|---|---|---|
| `Better_Home_Product_Database_V2.07.xlsx` | Workbook facts | `5e6bd554…ca620f` |
| `A4_Content_Mapping_Review_V1.md` | A4 mapping review | `a68587aa…63b77a8` |
| `Better_Home_Collections_A4_Review_Set_V1.pdf` | A4 review PDF | `f16c5344…723fff8` |

Verification: `src/v2/import/source-fingerprint.js` → `verifyApprovedSources()`.

## Pipeline (pure, no DB)

```
hash-verify sources
    → load workbook (read-only)
    → sheet contract check
    → Product Master / Pricing / Add-Ons row transforms
         ├─ DEC-013 legacy crosswalk (E-05/E-06/E-07)
         ├─ kind × role normalize (DEC-008)
         ├─ parent eligibility remap
         └─ approved DELTA overlays (planned)
    → ImportPlan IR  (dbWrite: false)
```

### Modules

| Module | Responsibility |
|---|---|
| `src/v2/import/source-fingerprint.js` | SHA-256 gate |
| `src/v2/import/workbook-reader.js` | Sheet load; skip legacy `12_Product_Card_Content` |
| `src/v2/import/type-normalize.js` | Workbook Type → `productKind` × `commercialRole` |
| `src/v2/import/legacy-crosswalk.js` (existing) | Identity remap / Protection → benefit |
| `src/v2/import/reference-remap.js` | FK / slash-list / text token remap |
| `src/v2/import/product-transforms.js` | Master / Add-on / Pricing row → plan rows |
| `src/v2/import/delta-overlays.js` | DELTA-C01…RENUMBER as planned overlays |
| `src/v2/import/build-import-plan.js` | Orchestrator → ImportPlan |

### Authority rules (encoded)

| Fact class | Authority | Master / Card Content |
|---|---|---|
| Customer price (A4) | `10_Pricing_Summary` | Master price = cache only |
| Customer copy | `14_Content_Library` | Master hero/subtitle = cache only; sheet 12 skipped |
| Theme accent | `17_Theme_Library` | Master accent = cache only |
| Product identity | Master + DEC-013 | Protection never a product |
| Costing (GP/margin) | Pricing Summary | Internal only — not customer facts |

### DEC-013 outcomes on workbook plan

| Legacy workbook | Plan action | Canonical |
|---|---|---|
| E-05 Protection Bonus | `SKIP_TO_BENEFIT` | `benefit.protection_bonus` on host **E-05** (CCTV) |
| E-06 CCTV | `UPSERT_PRODUCT` | **E-05** EXPERIENCE / PACK |
| E-07 Smart Toilet | `UPSERT_PRODUCT` | **E-06** STANDALONE |
| F-01, C-01…C-06, E-01…E-04 | `UPSERT_PRODUCT` | same codes |
| Protection price row | `SKIP_PRICE` | no `product_prices` |
| Unlock | planned benefit | C-01 ∧ C-06 ∧ E-05 |

Expected Master stats: **14** rows → **13** products + **1** benefit; **no** canonical E-07; **32** add-ons planned.

### Approved deltas (overlays only in 4A)

`DELTA-C01-DOOR`, `DELTA-C03-KICK`, `DELTA-C05-CIRCUIT`, `DELTA-C06-RETURN`, `DELTA-PROTECTION-BENEFIT`, `DELTA-RENUMBER-E` — emitted as `PLANNED` plan entries; **not** executed against Neon.

## ImportPlan IR (summary)

```text
{
  phase: "4A",
  dbWrite: false,
  neonConnection: false,
  fingerprint, sheetCheck, crosswalk, approvedDeltas,
  products[], addons[], prices[], aliases[], includedBenefits[],
  integrity, stats, warnings, nextPhaseGates
}
```

API: `buildImportPlanFromApprovedSources()` / `buildImportPlanFromWorkbook(wb)`.

## Tests

`tests/v2/phase4a-import-transforms.test.js` — fingerprints, synthetic transforms, full workbook plan integrity. Run via `npm run test:v2` (no Neon).

## Explicit non-goals (still)

- No Neon connection for fact import
- No `pos2_*` seed / catalogue write
- No production migrate
- Do **not** use V1 `scripts/import-excel.js` for V2 facts
- ISSUE-007 publish/assets, ISSUE-012 display modes remain **NEEDS_SOURCE**

## Next (Phase 4B — gated)

Apply ImportPlan to DEV Neon `pos2_*` only after explicit approval; keep CRM structural hashes unchanged; residual empty → facts loaded under provenance.
