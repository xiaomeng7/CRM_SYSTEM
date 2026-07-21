# Phase 3B.2a — Constraint Validation

- Date: 2026-07-18
- Status: **NOT_RUN**

## Reason

V2 migration `20260718120000_add_product_os_v2_schema` failed with P3018 / `42P17`.  
No `pos2_*` tables remain after the failed migration transaction rollback.

Constraint integration tests require V2 tables/constraints and were **not executed**.

## Planned tests (deferred)

| Test | Status |
|---|---|
| Price overlap (GiST) | NOT_RUN |
| Effective period order | NOT_RUN |
| CONTACT / EXACT / SUPPLY_ONLY amount rules | NOT_RUN |
| Kind × commercial role | NOT_RUN |
| Self relationship | NOT_RUN |
| Add-on no room / no experience | NOT_RUN |
| CTA partial unique | NOT_RUN |

Script prepared for a successful future deploy: `scripts/phase3b2a-constraint-tests.js` (ROLLBACK-only).
