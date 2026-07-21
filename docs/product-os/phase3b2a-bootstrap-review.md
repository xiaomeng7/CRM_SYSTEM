# Phase 3B.2a — Bootstrap Review

- Date: 2026-07-18
- Status: Bootstrap **succeeded**; subsequent V2 deploy **failed** (see deployment report)

## Prisma versions (local install)

| Component | Version / hash |
|---|---|
| `prisma` CLI | **6.19.3** |
| `@prisma/client` | **6.19.3** |
| Schema Engine | `schema-engine-cli` **c2990dca591cba766e3b7ef5d9e8a84796e47ab7** |
| Query Engine | `libquery-engine` **c2990dca591cba766e3b7ef5d9e8a84796e47ab7** |
| `@prisma/engines` | **6.19.3** |
| Default Engines Hash | **c2990dca591cba766e3b7ef5d9e8a84796e47ab7** |

## `_prisma_migrations` DDL proof

**Source (not from memory):** PostgreSQL flavour string embedded in installed binary:

```text
node_modules/.pnpm/@prisma+engines@6.19.3/node_modules/@prisma/engines/schema-engine-darwin-arm64
```

Extraction method: `strings <schema-engine>` → candidate with `TIMESTAMPTZ` / `now()` / `INTEGER` (not MySQL `DATETIME(3)` / `INTEGER UNSIGNED`).

**Verified DDL used by bootstrap:**

```sql
CREATE TABLE _prisma_migrations (
    id                      VARCHAR(36) PRIMARY KEY NOT NULL,
    checksum                VARCHAR(64) NOT NULL,
    finished_at             TIMESTAMPTZ,
    migration_name          VARCHAR(255) NOT NULL,
    logs                    TEXT,
    rolled_back_at          TIMESTAMPTZ,
    started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    applied_steps_count     INTEGER NOT NULL DEFAULT 0
);
```

Unit test `tests/v2/phase3b2a-bootstrap.test.js` re-checks engine string markers.

## Bootstrap script

| Item | Value |
|---|---|
| Script | `scripts/bootstrap-empty-prisma-migration-history.js` |
| Package script | `prisma:migration-history:bootstrap-dev` |
| Allowed env | `neon_dev` only |
| Fingerprint gate | exact `sha256:69cc4dd…df9ab` |
| Inserts rows | **No** |
| `migrate resolve` | **No** |

## Bootstrap result

| Check | Result |
|---|---|
| `_prisma_migrations` before | Absent |
| `_prisma_migrations` after | Present |
| Columns verified | id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count |
| PK | `id` |
| Row count after bootstrap (before deploy) | **0** |
| Manual migration records inserted | **No** |

## Status after bootstrap (before deploy)

- No `P3005`
- Pending: `20260708201000_init_product_os`, `20260718120000_add_product_os_v2_schema`
- No failed migrations at that moment
