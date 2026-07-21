# Phase 3B.2b — Deployment Report

- Date: 2026-07-18
- Status: **Completed**
- Target: `neon_dev` / `product-os-v2-dev` (`br-jolly-shape-a1rr3xq3`)
- Fingerprint: `sha256:2dec7eeaf2d657af6298f033bd35c73cab44a1388ff01455859d839516251fec`

## Phase outcomes

| Step | Result |
|---|---|
| Offline GiST proof (PG 17.10) | Pass |
| Patch V2 migration | Pass (checksum updated) |
| Offline tests/scans | Pass (`test:v2` 54) |
| Delete failed DEV branch | Pass |
| Recreate DEV from production | Pass |
| Empty `_prisma_migrations` bootstrap | Pass (0 rows) |
| Guarded deploy V1→V2 | Pass |
| Post inventory + CRM hashes | Pass |
| Constraint tests (ROLLBACK) | Pass (15/15) |

## Migrations

| Migration | Before | After | Checksum |
|---|---|---|---|
| `20260708201000_init_product_os` | Pending | **Applied** | `bdbf79ae…cb39` |
| `20260718120000_add_product_os_v2_schema` | Pending | **Applied** | `13ac2073…1a55` (corrected) |

Schema up to date. No failed / rolled-back rows.

## V1 verification

| Object | Expected | Actual |
|---|---:|---:|
| Tables | 16 | 16 |
| Enums | 3 | 3 |
| Views | 1 | 1 (`product_pricing_summary`) |
| Rows | 0 | **0** |

## V2 verification

| Object | Expected | Actual |
|---|---:|---:|
| `pos2_*` tables | 52 | **52** |
| `Pos2*` enums | 19 | **19** |
| `btree_gist` | installed | **Yes** |
| kind×role CHECK | present | Yes |
| price GiST exclusion | present | Yes |
| addon room/experience CHECKs | present | Yes |
| relationship no-self CHECK | present | Yes |
| alias resolution CHECK | present | Yes |
| Business rows | 0 | **0** (all Product OS tables empty) |

## CRM safety

| Metric | Pre (new branch) | Post |
|---|---|---|
| Tables / views | 72 / 10 | 72 / 10 |
| Table-name hash | `sha256:3e7dede0…7552` | unchanged |
| View-name hash | `sha256:a2943906…68d0` | unchanged |
| Index / FK / check hashes | unchanged | unchanged |

CRM schema/data changes: **None**. Production: **not connected / not changed**.

## Explicit confirmations

| Item | Result |
|---|---|
| Production connections made | **None** |
| Production changes | **None** |
| CRM schema changes | **None** |
| CRM data changes | **None** |
| Migration resolve performed | **No** |
| Manual migration records inserted | **No** |
| Seed performed | **No** |
| Facts imported | **No** |
| Placeholder data inserted | **No** |
| V1 applied to new Neon DEV | **Yes** |
| Corrected V2 applied to new Neon DEV | **Yes** |
| Product OS business tables empty | **Yes** |
| Test transactions rolled back | **Yes** |

## Recommended next phase

```text
Phase 4A — Source-to-V2 Import Transform Design
```

(Design/test transforms only — do not import facts yet.)
