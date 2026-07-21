# Phase 4A.1 — ImportPlan Coverage & Fact Reconciliation Gate

## Phase 4A.1 status

| Item | Value |
|---|---|
| Status | Completed — **Blocked for Phase 4B** |
| Neon connections | None |
| Database writes | None |
| Source files modified | No |
| ImportPlan version | 1.1.0 |
| Deterministic hash | `bcded26e0b678f10277a2f573745cf48cdd299eee0914b4f77f99cd176425810` |

## Coverage summary

| Context | Planned count | Notes |
| --- | --- | --- |
| products | 13 |  |
| productVersions | 13 |  |
| aliases | 3 |  |
| includedBenefits | 2 |  |
| experiences | 46 |  |
| capabilities | 54 |  |
| bomItems | 67 |  |
| labourLibrary | 36 |  |
| labourApplications | 87 |  |
| equipmentSkus | 49 |  |
| rules | 47 |  |
| automations | 22 |  |
| addons | 32 |  |
| prices | 13 |  |
| contentEntries | 52 |  |
| themes | 14 |  |
| assets | 13 |  |
| icons | 28 |  |
| layouts | 13 |  |
| costingSettings | 7 |  |
| relationshipsExpandFurther | 0 | missing_source — DEC-010 approves A4 Expand Further as initial relationship source; structured rows not yet extracted into ImportPlan (transform gap) |
| featuredAddonOrders | 0 | missing_source — ISSUE-014; eligibility exists without featured sort |
| a4PresentationMappings | 0 | missing_source — DEC-009/012; A4 presentation map + verbatim copy not fully in Content Library |
| decisionDeltaOverlays | 6 |  |

## Product readiness

| Product | Import | Publish | Blocking |
| --- | --- | --- | --- |
| F-01 | IMPORTABLE_BUT_NOT_PUBLISHABLE | NOT_PUBLISHABLE | see areas / P1 assets+A4 |
| C-01 | IMPORTABLE_BUT_NOT_PUBLISHABLE | NOT_PUBLISHABLE | see areas / P1 assets+A4 |
| C-02 | IMPORTABLE_BUT_NOT_PUBLISHABLE | NOT_PUBLISHABLE | see areas / P1 assets+A4 |
| C-03 | IMPORTABLE_BUT_NOT_PUBLISHABLE | NOT_PUBLISHABLE | see areas / P1 assets+A4 |
| C-04 | IMPORTABLE_BUT_NOT_PUBLISHABLE | NOT_PUBLISHABLE | see areas / P1 assets+A4 |
| C-05 | IMPORTABLE_BUT_NOT_PUBLISHABLE | NOT_PUBLISHABLE | see areas / P1 assets+A4 |
| C-06 | IMPORTABLE_BUT_NOT_PUBLISHABLE | NOT_PUBLISHABLE | see areas / P1 assets+A4 |
| E-01 | IMPORTABLE_BUT_NOT_PUBLISHABLE | NOT_PUBLISHABLE | see areas / P1 assets+A4 |
| E-02 | IMPORTABLE_BUT_NOT_PUBLISHABLE | NOT_PUBLISHABLE | see areas / P1 assets+A4 |
| E-03 | IMPORTABLE_BUT_NOT_PUBLISHABLE | NOT_PUBLISHABLE | see areas / P1 assets+A4 |
| E-04 | IMPORTABLE_BUT_NOT_PUBLISHABLE | NOT_PUBLISHABLE | see areas / P1 assets+A4 |
| E-05 | IMPORTABLE_BUT_NOT_PUBLISHABLE | NOT_PUBLISHABLE | see areas / P1 assets+A4 |
| E-06 | IMPORTABLE_BUT_NOT_PUBLISHABLE | NOT_PUBLISHABLE | see areas / P1 assets+A4 |
| benefit.protection_bonus | COMPLETE_FOR_DEV_IMPORT | N/A (not a product) | hosted on E-05 |

## Decisions

- DEC-001…013 rows: see `phase4a1-decision-reconciliation.md`
- Fully applied (incl. planned overlays): 10
- Not applied: DEC-010, DEC-012

## Add-ons

- Total: 32
- OK: 32
- Blocked: 0
- Orphan: 0

## A4 coverage

See `phase4a1-a4-content-coverage.md`.

## Issues

- P0: 2
- P1: 2
- P2: 2
- INFO: 3
- Silent skips: 0

## Determinism

Runs identical: **true** — `bcded26e0b678f10277a2f573745cf48cdd299eee0914b4f77f99cd176425810`

## Explicit confirmations

- Neon connections made: None
- Production connections made: None
- Database writes: None
- Migration operations: None
- Facts imported: None
- Source workbook modified: No
- Approved A4 copy modified: No
- Legacy sheet 12 used as authority: No
- Protection created as product: No
- Canonical E-07 created: No
- Placeholder facts created: No
- Silent skips: 0
- P0 blockers: 2
- ImportPlan ready for Phase 4B: **No**

## BOM / scope notes (Step 9)

Workbook BOM + capability + rules are planned into ImportPlan (costs redacted). Key boundaries retained as source facts / DEC overlays — not overridden by A4 wording:

- C-01: DEC-001 plans MAG-001 door contact (absent in workbook BOM today)
- C-03: capability normalized to Warm Kickboard Ambient Zone (DEC-002)
- C-05: six compatible circuits qualifier (DEC-003); exhaust fan body excluded per review notes
- C-06: four wireless contacts; Return Routine planned (DEC-004); not alarm monitoring
- E-05 CCTV: 4× camera + NVR/storage facts from remapped Legacy E-06 BOM
- E-06 Smart Toilet: supply-only commercial exception (DEC-011)
- Curtain / >3m / dual-track / fabric exclusions remain in rules notes (not invented)

A4 copy must not override these technical quantities.

## Remap audit (Step 6)

- Legacy E-06 → E-05 (CCTV): proven via aliases
- Legacy E-07 → E-06 (Smart Toilet): proven
- Legacy E-05 Protection → `benefit.protection_bonus`: proven
- No canonical E-07; no duplicate E-05/E-06 products
- Add-on parents remapped; Protection dropped from parent lists

## Gate decision

```text
Phase 4B NOT APPROVED
```

Stop for Product Owner review.
