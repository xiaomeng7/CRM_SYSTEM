# Phase 3B.1 — V2 Collision Preview (Read-only)

- Date: 2026-07-18
- Migration under preview: `20260718120000_add_product_os_v2_schema`
- Status: Preview only — **not executed**

## Existing V2 objects on Neon DEV

| Object class | Count found | Notes |
|---|---:|---|
| `pos2_*` tables | **0** | None present |
| `Pos2*` / `pos2*` enums | **0** | None present |
| V2 indexes / constraints | **0** | n/a (no tables) |
| `btree_gist` extension | **Not installed** | Required by V2 supplemental price exclusion constraints |

## Naming collisions vs current public schema

Compared planned CREATE targets from V2 migration SQL against actual public tables/views:

| Check | Result |
|---|---|
| `pos2_*` table name collisions | **None** |
| Planned V2 enum name collisions | **None** (no overlapping enum type names present) |
| Accidental overlap with CRM table names | **None** detected for `pos2_*` prefix |

Separately, Product OS **V1** names from `20260708201000_init_product_os` also show **no** collisions with the 72 CRM tables / 10 views (e.g. `settings`, `product_catalog` are free).

## Destructive / non-additive scan of V2 migration SQL

| Pattern | Hits |
|---|---:|
| `DROP` | 0 |
| `TRUNCATE` | 0 |
| `DELETE` | 0 |
| `UPDATE` | 0 |
| `ALTER TABLE` on non-`pos2_*` | 0 |
| `ALTER TABLE` on `pos2_*` (additive constraints after create) | Present (expected Phase 3A.1 CHECKs / exclusion) |

Conclusion: V2 migration remains an **additive** design for a clean `pos2_*` namespace.

## Extension readiness

| Extension | Required by V2? | Installed now |
|---|---|---|
| `btree_gist` | Yes (`CREATE EXTENSION IF NOT EXISTS btree_gist`) | **No** |
| `pgcrypto` | Useful for `gen_random_uuid` in some contexts | Yes (already present) |
| `plpgsql` | Platform default | Yes |

`CREATE EXTENSION IF NOT EXISTS btree_gist` in the V2 migration should install it on deploy (requires privilege on Neon — typically available). Not executed in 3B.1.

## Ordering implication (Scenario C)

Because Product OS V1 is absent and both migrations are pending:

1. A future approved deploy path would normally apply **V1 init first**, then **V2 additive**.
2. Applying only V2 without V1 is **not** what the Prisma migration history expects (ordered pending list).
3. Co-locating Product OS with CRM tables appears name-safe, but is a **Product Owner product/architecture decision**, not an automatic next step.

## V2 migration readiness

| Gate | Status |
|---|---|
| Additive `pos2_*` design | Ready |
| No existing `pos2_*` collision | Ready |
| No destructive V1 touches in V2 SQL | Ready |
| `btree_gist` pre-installed | Not required pre-deploy (`IF NOT EXISTS` in SQL) |
| PO approval to deploy into CRM-inherited branch | **Pending** |
| Baseline Scenario A resolve | **Not applicable** |

**Do not deploy in Phase 3B.1.**
