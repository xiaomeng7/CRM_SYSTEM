# Phase 3B.2 — Migration Inventory

- Date: 2026-07-18
- Target: `neon_dev` / `product-os-v2-dev`
- Fingerprint: `sha256:69cc4ddcb715dd93338d45a79f6135deef25124af23b069380ccd52e071df9ab`

## Local artifacts

| Migration | Path | SHA-256 | Role |
|---|---|---|---|
| `20260708201000_init_product_os` | `prisma/migrations/20260708201000_init_product_os/migration.sql` | `bdbf79ae400211291e539894138aedee32f73295de155ab1a3a8ca35a413cb39` | Product OS V1 |
| `20260718120000_add_product_os_v2_schema` | `prisma/migrations/20260718120000_add_product_os_v2_schema/migration.sql` | `d7d3e8fd0073602d70f19a41af96123a502433a4b8dcfd1a5afb7d87ae835a61` | Product OS V2 (`pos2_*`) |

Migration SQL was **not modified** during Phase 3B.2.

## Safety scans (Step 1)

| Check | Result |
|---|---|
| `pnpm test:v2` | Pass (47) |
| `prisma validate` | Pass |
| `scan-migration-safety` | Pass |
| `scan-package-db-scripts` | Pass (no unguarded deploy) |
| V2 non-`pos2_` ALTER targets | None |

## Remote history

| Item | Before deploy | After P3005 |
|---|---|---|
| `_prisma_migrations` table | Absent | Absent |
| Applied migrations | None | None |
| Failed migrations | None | None |
| Rolled-back migrations | None | None |
| Pending | V1 + V2 | V1 + V2 |

## Expected object counts (when deploy eventually succeeds)

| Family | Expected (from SQL / Prisma) |
|---|---|
| V1 tables | 16 |
| V1 enums | 3 |
| V1 views | 1 (`product_pricing_summary`) |
| V2 `pos2_*` tables | 52 (from CREATE TABLE scan) |
| V2 enums | 19 (`Pos2*` types) |

**Actual on Neon DEV after 3B.2 attempt:** all Product OS expected counts remain **0**.
