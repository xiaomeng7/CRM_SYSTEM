# Phase 3B.2a — Deployment Report

- Date: 2026-07-18
- Status: **Failed / Partial**
- Target: `neon_dev` / `product-os-v2-dev`
- Fingerprint: `sha256:69cc4ddcb715dd93338d45a79f6135deef25124af23b069380ccd52e071df9ab`

## Summary

1. Empty `_prisma_migrations` bootstrap **succeeded** (0 rows).
2. Guarded deploy **started** and **executed** V1 SQL successfully.
3. V2 migration **failed** with PostgreSQL `42P17` / Prisma **P3018** on GiST exclusion index expression (`functions in index expression must be marked IMMUTABLE`).
4. Per safety rules: **stopped** — no resolve, no SQL edit, no retry, no manual DDL completion.

## Production / CRM

| Item | Result |
|---|---|
| Production connections | **None** |
| CRM table/view name hashes | **Unchanged** vs pre-bootstrap |
| CRM structural index/FK/check hashes | **Unchanged** |
| CRM data writes | **None** |

## Migrations

| Migration | Before | After | Result |
|---|---|---|---|
| `20260708201000_init_product_os` | Pending | **Applied** | Success; checksum `bdbf79ae…cb39` matches local artifact |
| `20260718120000_add_product_os_v2_schema` | Pending | **Failed** | P3018 / `42P17`; `finished_at` null; `applied_steps_count` 0 |

### V2 failure (sanitized)

```text
Error: P3018
Migration name: 20260718120000_add_product_os_v2_schema
Database error code: 42P17
ERROR: functions in index expression must be marked IMMUTABLE
```

Likely statement (not executed successfully): `pos2_product_prices_no_overlap_active_excl` using `(fulfilment_mode)::text` / `(tax_basis)::text` inside GiST `EXCLUDE`.

Because Prisma wraps the migration in a transaction, **no `pos2_*` tables remain** after the failure (`pos2_*` count = 0). `btree_gist` also not left installed (extension create rolled back with the failed migration transaction, or never committed).

## Current Product OS state

| Family | Expected (full success) | Actual now |
|---|---:|---:|
| V1 tables | 16 | **16** (empty) |
| V1 enums | 3 | **3** |
| V1 views | 1 | **1** (`product_pricing_summary`) |
| `pos2_*` tables | ~52 | **0** |
| V2 enums / constraints | many | **0** |
| `btree_gist` | installed | **No** |

## Constraint tests

**NOT_RUN** — V2 schema absent after failed migration.

## Explicit confirmations

| Item | Result |
|---|---|
| Production connections made | **None** |
| Production changes | **None** |
| CRM schema changes | **None** |
| CRM data changes | **None** |
| Migration resolve performed | **No** |
| Manual migration records inserted | **No** (bootstrap created empty table only) |
| Seed performed | **No** |
| Facts imported | **No** |
| Placeholder data inserted | **No** |
| V1 migration actually executed | **Yes** |
| V2 migration actually executed | **Started then failed / rolled back** (no `pos2_*` left) |
| Product OS business tables empty | **Yes** (V1 empty; V2 absent) |
| Test transactions rolled back | **N/A** |

## Recommended next action (do not execute here)

**Do not** `migrate resolve` on the failed V2 migration in this polluted history state without an approved remediation plan.

Preferred recovery (matches prior plan):

1. **Delete and recreate** Neon branch `product-os-v2-dev` from `production` (CRM baseline only).
2. In a **new approved engineering phase**, revise the **unapplied** V2 migration artifact so the GiST exclusion uses IMMUTABLE expressions (e.g. dedicated text columns or immutable cast strategy) — **before** any re-deploy.
3. Re-run 3B.2a bootstrap + guarded deploy on the fresh branch.

Alternative (higher risk, not recommended without PO): carefully mark failed migration rolled back + drop any partial objects — but current evidence shows **no pos2 objects**, so branch recreate remains cleaner for history hygiene.
