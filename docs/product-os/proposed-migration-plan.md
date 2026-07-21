# Product OS — Proposed Migration Plan

- Date: 2026-07-18
- Status: Phase 0–2A + **DEC-013** recorded; **Phase 3A.1 + DEC-013 schema refresh complete — awaiting 3B approval**.
- Governance: No product-fact invention. Immutable sources unchanged. V1 untouched.

---

## Progress

| Phase | Status |
|---|---|
| 0 Audit | Complete |
| 1 Target model | Complete (amended DEC-013) |
| 2 Reconciliation | Complete |
| 2A PO decisions | Complete (DEC-001…**013**) |
| **3A Additive schema + migration artifacts** | **Complete (not applied; migration revised for DEC-013)** |
| 3B Apply to Neon DEV | **3B.2b Completed — V1+V2 on rebuilt product-os-v2-dev (empty)** |
| 4 Importer | Pending (`planned-importer-transforms.md`) |
| 5 Import + reconcile | Pending |
| 6–9 Read model / validation / A4 / prod readiness | Pending |

---

## Phase 3A / DEC-013 outcomes

- Additive Prisma V2 models/enums (`Pos2*`, tables `pos2_*`)
- Migration `20260718120000_add_product_os_v2_schema` (**unapplied**; refreshed for aliases, included benefits, kind×role CHECK without EXPERIENCE+BONUS)
- `pos2_product_aliases` + `pos2_included_benefits`
- Legacy crosswalk + shared Product Page read-model contract + unit tests
- Structural validators + env guard
- Docs: ADR-012, `legacy-id-crosswalk.md`, `product-page-read-model.md`, `planned-importer-transforms.md`

**Database connections made:** None  
**Database changes:** None  

---

## Phase 3B prerequisites (next)

1. Approve revised Phase 3A schema/migration (includes DEC-013).
2. Provide isolated Neon **DEV** URL via `PRODUCT_OS_DEV_DATABASE_URL`.
3. Set `PRODUCT_OS_DATABASE_ENV=neon_dev`.
4. Run guarded migrate deploy against DEV only.
5. Confirm V1 tables unchanged; `pos2_*` empty.
6. Still **no** product fact import.

---

## Guiding decisions (closed)

ADR-001…012; DEC-001…013; IMP-01…06; SAFE-01…03.

---

## Risks

- R1. Migration not yet applied — **DEC-013 revised the unapplied SQL in-place**; must deploy this revision (not an older copy).
- R2. ISSUE-007 assets still missing for publish.
- R3. Import transforms for Phase 2A deltas + DEC-013 crosswalk not yet executed.
- R4. Guarded migrate currently aborts by design until 3B unlock; production refuse rules must stay intact.
