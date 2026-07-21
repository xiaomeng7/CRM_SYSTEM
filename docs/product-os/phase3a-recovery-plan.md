# Phase 3A Recovery Plan — Product OS V2 schema

- Date: 2026-07-18
- Status: Document only — **do not execute** in Phase 3A
- Goal: Remove or abandon V2 structures without damaging V1

## Preconditions

- V2 tables use exclusive `pos2_` prefix and `Pos2*` enum types.
- No V2 → V1 foreign keys exist.
- V1 application code does not query `pos2_*`.
- Confirm no Neon/production migration history includes this migration before destructive recovery on a shared branch.

## Preferred recovery (dev / unused branch)

1. If migration **was never applied**: delete or ignore the migration folder only after review approval to retract Phase 3A (normally keep it).
2. If migration **was applied on an isolated Neon DEV branch**:
   - Prefer resetting/deleting the Neon **development branch** (ADR-004) rather than hand-dropping objects.
   - Recreate branch from parent if needed.
3. If migration **must be reversed in-place** on a database that also holds V1:

```sql
-- ILLUSTRATIVE ONLY — review before any execution.
-- Order: drop tables with FKs first, then enums.

-- Option A (simple when no non-pos2 dependents): drop all pos2 tables
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'pos2_%'
  ) LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.tablename);
  END LOOP;
END $$;

-- Drop Pos2 enums
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT t.typname
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname LIKE 'Pos2%'
  ) LOOP
    EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', r.typname);
  END LOOP;
END $$;

-- Remove Prisma migration history row for this migration only (if present)
-- DELETE FROM "_prisma_migrations" WHERE migration_name = '20260718120000_add_product_os_v2_schema';
```

4. Verify V1:

```sql
SELECT COUNT(*) FROM product_catalog;
SELECT COUNT(*) FROM settings;
-- product_pricing_summary view still present
```

5. Regenerate Prisma client from schema if V2 models are later removed from `schema.prisma` (not recommended without a new approved phase).

## What recovery must NOT do

- Drop or alter V1 tables/enums/views.
- Truncate `product_catalog` or related V1 data.
- Rewrite `20260708201000_init_product_os`.
- Point production `DATABASE_URL` at recovery experiments.
- Print connection secrets in logs or tickets.

## Abandon-in-place (non-destructive)

If V2 is deferred:

- Leave empty `pos2_*` tables unused.
- Keep V1 consumers on `src/index.js`.
- Do not seed or expose V2 read models.
- Track abandonment via `pos2_migration_issues` / open decisions.

## Phase 3A note

This recovery plan is for review readiness. **No rollback was executed.**
