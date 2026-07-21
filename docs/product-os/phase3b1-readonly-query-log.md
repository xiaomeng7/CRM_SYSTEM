# Phase 3B.1 — Read-only Query Log

- Date: 2026-07-18
- Runner: `packages/product-os/scripts/phase3b1-readonly-inventory.js`
- Target env: `neon_dev`
- Fingerprint: `sha256:69cc4ddcb715dd93338d45a79f6135deef25124af23b069380ccd52e071df9ab`
- Transaction: `BEGIN READ ONLY` + `SET TRANSACTION READ ONLY`
- Writes: **None**
- Secrets logged: **None** (URL / user / password / query params omitted)

## Guarded Prisma commands

| Purpose | Object | Type | Rows | Read-only | Result |
|---|---|---|---:|---|---|
| Target identity preflight | migrate runner | preflight (no DB) | 0 | yes | OK exit 0 |
| Migration status | Prisma migrate status | status (connect) | n/a | yes | Pending×2; exit 1 expected |

## Inventory SELECT catalog

| Purpose | Object | Type | Rows | Read-only | Result |
|---|---|---|---:|---|---|
| Session database / Neon ids | `current_database` / neon settings | SELECT | 1 | yes | ok |
| List neon.* settings | `pg_settings` | SELECT | 116 | yes | ok |
| Installed extensions | `pg_extension` | SELECT | 2 | yes | ok |
| Public enums + labels | `pg_type` / `pg_enum` | SELECT | 0 | yes | ok |
| Public base tables | `information_schema.tables` | SELECT | 72 | yes | ok |
| Public views + definitions | `pg_views` | SELECT | 10 | yes | ok |
| Column metadata | `information_schema.columns` | SELECT | 1140 | yes | ok |
| Primary keys | `table_constraints` PK | SELECT | 72 | yes | ok |
| Unique constraints | `table_constraints` UNIQUE | SELECT | 36 | yes | ok |
| Foreign keys | referential constraints | SELECT | 96 | yes | ok |
| Check constraints | check constraints | SELECT | 383 | yes | ok |
| Indexes | `pg_indexes` | SELECT | 368 | yes | ok |
| `_prisma_migrations` existence | `information_schema.tables` | SELECT | 1 | yes | ok (`exists=false`) |
| `_prisma_migrations` rows | `_prisma_migrations` | SELECT | 0 | yes | skipped (table absent) |
| Existing `pos2_*` tables | `information_schema.tables` | SELECT | 0 | yes | ok |
| Existing Pos2 enums | `pg_type` | SELECT | 0 | yes | ok |
| `btree_gist` installed? | `pg_extension` | SELECT | 1 | yes | ok (`installed=false`) |

Machine evidence (redacted): `_phase3b1-inventory.json`.

## Non-goals confirmed

- No `INSERT` / `UPDATE` / `DELETE` / `DDL`
- No `migrate deploy` / `migrate resolve` / `db push`
- No seed / importer
- No production URL selection
