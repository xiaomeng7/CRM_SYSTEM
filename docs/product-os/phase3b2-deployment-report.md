# Phase 3B.2 — Deployment Report

- Date: 2026-07-18
- Phase: **3B.2 — Apply Product OS V1 + V2 to Neon DEV**
- PO decision: **C1 approved** (additive Product OS on CRM-inherited `product-os-v2-dev`)
- Status: **Failed / Blocked — Prisma P3005 (no schema changes applied)**

## Target

| Item | Value |
|---|---|
| Environment | `neon_dev` |
| Neon branch (declared) | `product-os-v2-dev` |
| Sanitized fingerprint | `sha256:69cc4ddcb715dd93338d45a79f6135deef25124af23b069380ccd52e071df9ab` |
| Fingerprint match | **Yes** (exact) |
| Production connections | **None** |
| Root `DATABASE_URL` as target | **No** |
| Deploy command | `safe-prisma-migrate.js --env neon_dev --mode deploy --execute-approved-migration` |

## Step results

| Step | Result |
|---|---|
| 1 Local artifact validation | **Passed** (`test:v2` 47 pass; `prisma validate` OK; migration + package scans OK) |
| 2 Guarded preflight | **Passed** |
| 3 Pre-deployment inventory | **Passed** — matches Phase 3B.1 (72 CRM tables / 10 views / 0 Product OS) |
| 4 Migration status | **Passed expectation** — both migrations pending; no failed history |
| 5 Guarded deploy | **Failed — P3005** |
| 6–9 Post verify / constraints / tests | **Not run** (stopped after failure; no objects to verify) |

## Migrations

| Migration | Before | After | Result |
|---|---|---|---|
| `20260708201000_init_product_os` | Pending | **Pending** | Not applied (deploy aborted before SQL) |
| `20260718120000_add_product_os_v2_schema` | Pending | **Pending** | Not applied |

### Deploy error (sanitized)

```text
Error: P3005
The database schema is not empty.
```

Prisma refuses `migrate deploy` when:

1. the database already contains tables (CRM inheritance), and  
2. `_prisma_migrations` does not yet exist.

No Product OS DDL ran. Post-fail inventory confirms unchanged CRM structural hashes and still **0** Product OS objects.

## Local migration checksums (unchanged; not modified)

| File | SHA-256 |
|---|---|
| `20260708201000_init_product_os/migration.sql` | `bdbf79ae400211291e539894138aedee32f73295de155ab1a3a8ca35a413cb39` |
| `20260718120000_add_product_os_v2_schema/migration.sql` | `d7d3e8fd0073602d70f19a41af96123a502433a4b8dcfd1a5afb7d87ae835a61` |

## Explicit confirmations

| Item | Result |
|---|---|
| Production connections made | **None** |
| Production changes | **None** |
| CRM schema changes | **None** (hashes identical pre vs post-fail) |
| CRM data changes | **None** |
| Migration resolve performed | **No** |
| Seed performed | **No** |
| Facts imported | **No** |
| Placeholder data inserted | **No** |
| V1 migration applied to Neon DEV | **No** |
| V2 migration applied to Neon DEV | **No** |
| Product OS tables remain empty | **N/A — tables not created** |
| Constraint test transactions rolled back | **N/A — not run** |
| Auto-retry / SQL edit / manual object create | **No** (stopped per safety rules) |

## Why C1 “normal deploy” hit P3005

C1 correctly chose co-location with CRM. Prisma’s first-deploy rule assumes either:

- an **empty** database, or  
- an existing `_prisma_migrations` history (baseline / prior Prisma use).

This Neon branch has CRM tables but **no** Prisma migration history → P3005.

This is **not** Scenario A (V1 already present). Therefore **`migrate resolve --applied` for V1 is the wrong tool** — it would mark V1 applied **without** creating Product OS tables.

## Recommended PO decision (do not execute yet)

See `phase3b2-recovery-status.md`.

Preferred path for C1:

**3B.2a — Approve empty `_prisma_migrations` bootstrap (history table only; zero migrations marked applied), then re-run the same guarded `migrate deploy`.**

That allows Prisma to actually execute V1 then V2 SQL on the non-empty CRM database without skipping migrations.

## Artifacts

- `phase3b2-recovery-status.md`
- `phase3b2-pre-post-schema-comparison.md`
- `phase3b2-migration-inventory.md`
- `phase3b2-constraint-validation.md` (NOT_RUN)
- `_phase3b2-pre.json`, `_phase3b2-post-fail.json`
- `scripts/phase3b2-schema-snapshot.js`
