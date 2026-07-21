# Phase 3B.1 — Baseline Reconciliation Report

- Date: 2026-07-18
- Phase: **3B.1 — Migration Baseline Reconciliation (read-only)**
- Status: **Completed**
- Selected scenario: **C — V1 schema absent**

## Target identity

| Item | Value |
|---|---|
| Environment | `neon_dev` |
| Declared Neon branch | `product-os-v2-dev` (parent: `production`) |
| Branch proof method | Operator-declared flag + fingerprint-approved `PRODUCT_OS_DEV_DATABASE_URL` |
| Sanitized host fingerprint | `sha256:69cc4ddcb715dd93338d45a79f6135deef25124af23b069380ccd52e071df9ab` |
| URL env var used | `PRODUCT_OS_DEV_DATABASE_URL` only |
| Root `DATABASE_URL` used as target | **No** |
| Production connections | **None** |
| Neon project id (non-secret) | `silent-block-70931865` |
| Neon branch id (non-secret) | `br-patient-credit-a1ju5yoa` |
| Database name | `neondb` |
| Server | PostgreSQL 17.10 |
| Read-only protection | `BEGIN READ ONLY` + `SET TRANSACTION READ ONLY` + SELECT-only catalog |

## Step 1 — Guarded preflight / status

### Preflight

```text
env: neon_dev
mode: preflight
hostFingerprint: sha256:69cc4ddcb715dd93338d45a79f6135deef25124af23b069380ccd52e071df9ab
migrationName: 20260718120000_add_product_os_v2_schema
result: Preflight OK (no DB connection)
exit: 0
```

### Status (read-only)

```text
env: neon_dev
mode: status
hostFingerprint: sha256:69cc4ddcb715dd93338d45a79f6135deef25124af23b069380ccd52e071df9ab
result: 2 migrations found; neither applied
pending:
  - 20260708201000_init_product_os
  - 20260718120000_add_product_os_v2_schema
exit: 1  (expected when pending migrations exist; connection succeeded)
```

Note: Prisma CLI echoed a sanitized host label during status. Credentials / full URL were not printed by Product OS guards. Docs below use fingerprint only.

## V1 reconciliation verdict

| Metric | Result |
|---|---|
| Actual Product OS V1 tables | **0 / 16** |
| Actual Product OS V1 enums | **0 / 3** |
| Actual Product OS V1 views | **0 / 1** (`product_pricing_summary`) |
| `_prisma_migrations` table | **Absent** |
| V1 migration recorded | **No** |
| Structural result vs V1 migration | **Missing (not Exact / not Semantic)** |
| Scenario | **C** |

### What the database actually contains

The `product-os-v2-dev` branch (forked from production) currently holds the **CRM** application schema:

- **72** public base tables (e.g. `accounts`, `contacts`, `leads`, `jobs`, …)
- **10** CRM views
- Extensions: `plpgsql`, `pgcrypto` only
- **No** Product OS V1 objects
- **No** `pos2_*` V2 objects
- **No** `_prisma_migrations`

Therefore this is **not** Scenario A (exact V1 present, history missing).  
It is **Scenario C**: Product OS V1 schema is absent; Product OS migration history is also absent.

## Differences (severity)

| Severity | Finding |
|---|---|
| P0 (baseline) | All Product OS V1 tables missing vs `20260708201000_init_product_os` |
| P0 (baseline) | All Product OS V1 enums missing (`product_type`, `record_status`, `included_type`) |
| P0 (baseline) | View `product_pricing_summary` missing |
| P0 (history) | `_prisma_migrations` does not exist — cannot “resolve as applied” anything yet |
| Info | 72 CRM tables are **DB_ONLY** relative to Product OS V1 migration (expected if parent = CRM production) |
| Info | No naming collision between pending Product OS V1/V2 object names and existing CRM tables/views |

Full object matrix: `phase3b1-v1-schema-comparison.md`

## V2 collision preview (summary)

| Check | Result |
|---|---|
| Existing `pos2_*` tables | **0** |
| Existing `Pos2*` enums | **0** |
| `btree_gist` installed | **No** |
| Naming collisions with CRM | **None** detected for planned `pos2_*` / V1 names |
| Destructive V1 statements in V2 SQL | **None** |
| V2 migration design | Still additive |

Detail: `phase3b1-v2-collision-preview.md`

## Recommended next action (do not execute)

**Stop for Product Owner decision.** Because Scenario **C** (not A):

1. Do **not** run `prisma migrate resolve`.
2. Do **not** run `prisma migrate deploy` until PO confirms it is intentional to create Product OS V1 (+ later V2) **inside this CRM-inherited Neon branch**.
3. Confirm whether `product-os-v2-dev` should:
   - **Option C1:** Remain a CRM-parent branch and receive Product OS tables additively (shared Neon project), or
   - **Option C2:** Be recreated from a Product OS–empty / Product OS–only baseline if CRM co-location was unintended.
4. After PO chooses C1 or C2, a follow-on phase can propose deploy of `20260708201000_init_product_os` (Scenario C path) — still requiring explicit approval.
5. **Phase 3B.2 — DEV-only baseline resolve approval** is **not** applicable (that phase is only for Scenario A).

## Explicit confirmations

| Item | Result |
|---|---|
| Production connections made | **None** |
| Database writes | **None** |
| Migration resolve performed | **No** |
| Migration deploy performed | **No** |
| Facts imported | **No** |
| V1 modified | **No** |
| V2 schema applied | **No** |

## Artifacts

| File | Purpose |
|---|---|
| `phase3b1-v1-schema-comparison.md` | Four-source V1 comparison matrix |
| `phase3b1-v2-collision-preview.md` | V2 readiness / collision audit |
| `phase3b1-readonly-query-log.md` | Read-only query log |
| `_phase3b1-inventory.json` | Machine inventory (redacted; supporting evidence) |
| `scripts/phase3b1-readonly-inventory.js` | Guarded read-only inventory runner |

No drift register file was created: Product OS V1 is fully absent rather than partially drifted. CRM objects are out of Product OS V1 scope (DB_ONLY vs Product OS migrations).
