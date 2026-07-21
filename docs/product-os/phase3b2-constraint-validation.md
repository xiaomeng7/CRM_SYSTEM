# Phase 3B.2 — Constraint Validation

- Date: 2026-07-18
- Status: **NOT_RUN_SAFETY_GUARD**

## Reason

Guarded deploy failed with Prisma **P3005** before any Product OS tables, enums, or constraints were created.

Per Phase 3B.2 rules:

- no automatic retry
- no manual object creation
- no constraint tests against missing schema

## Planned tests (deferred to successful deploy)

| Test | Planned method | Status |
|---|---|---|
| A. Price overlap rejection | `BEGIN` → insert overlapping ACTIVE prices → expect GiST fail → `ROLLBACK` | NOT_RUN |
| B. Invalid effective period | `effective_to <= effective_from` rejection → `ROLLBACK` | NOT_RUN |
| C. Amount / display mode | CONTACT / EXACT / FROM / SUPPLY_ONLY checks → `ROLLBACK` | NOT_RUN |
| D. Kind × commercial role | Illegal pair rejected by `pos2_products_kind_role_chk` → `ROLLBACK` | NOT_RUN |
| E. Relationship safety | self-ref / addon room / addon experience / CTA unique → `ROLLBACK` | NOT_RUN |

## Rollback / residual records

| Item | Result |
|---|---|
| Constraint test transactions rolled back | N/A |
| Test records remaining | N/A (0 Product OS tables) |
