# Phase 3A.1 Remediation Notes

- Date: 2026-07-18
- Status: Remediation complete for review — **still not approved for Neon deploy**
- Database connections made: **None**
- Database changes: **None**
- Migration `20260718120000_add_product_os_v2_schema`: **still unapplied** (refreshed in-place because never applied anywhere)

## Findings remediated

1. Removed `prisma:migrate:deploy:unguarded`; scanners/tests prevent reintroduction.
2. Functional guarded runner with `preflight` / `status` / `deploy`, sanitized child env, allowlisted Prisma args, no shell interpolation.
3. Cryptographic SHA-256 host fingerprints; reject missing/mismatch; reject identical dev/prod identities; no local→dev fallback; dual production confirmations.
4. Price effective-period validators + DB CHECK + **Approach A** GiST exclusion constraint (`btree_gist`) for ACTIVE visible prices.
5. Migration SQL regenerated consistently with schema; additive; no V1 ALTER/DROP.

## Price overlap approach (Approach A)

Selected **PostgreSQL `EXCLUDE USING gist`** on `pos2_product_prices` for ACTIVE + `customer_visible` rows, keyed by price book, product, currency, fulfilment mode, tax basis, and half-open `tstzrange`.

Why safe for automatic quoting:
- Overlaps fail at commit time even if importer or concurrent writers skip validators.
- Half-open `[)` ranges make adjacent periods valid (no double price).
- Application validators remain mandatory for clear error messages before write.

Phase 3B integration test (pending DB): insert two overlapping ACTIVE prices and assert exclusion violation.

Limitation: Neon branch identity is not encoded in URL alone beyond host/db; approved fingerprint must be captured during Phase 3B preflight and stored in `PRODUCT_OS_DEV_HOST_FINGERPRINT`.

## Kind × role enforcement

- Application: `V2_KIND_ROLE_COMBO`
- Database: `pos2_products_kind_role_chk`

## CTA duplicates

- Application: `V2_CTA_NO_DUP_ACTIVE`
- Database: partial unique `pos2_product_relationships_active_cta_uidx`

## Additional review checks

| Topic | Finding |
|---|---|
| `updated_at` | Prisma `@updatedAt` on models; direct SQL imports must set `updated_at` explicitly — document for Phase 4 importer |
| UUID creation | Prisma `@default(uuid())` (client-side default in Prisma) — DB has no `gen_random_uuid()` default unless added later; imports via Prisma preferred |
| Imports use Prisma? | Phase 4 design: Prisma recommended; raw SQL must populate timestamps/UUIDs |
| Polymorphic refs | Validated by `V2_POLYMORPHIC_REF` (release components / fact references) — not DB FK |
| Nullable CTA targets | Partial unique index + validator |
| Dual-axis combos | App + DB CHECK |

## Exact Phase 3B preflight procedure (do not run until approved)

1. Create/isolate Neon **development** branch database.
2. Set `PRODUCT_OS_DEV_DATABASE_URL` only (never use root `DATABASE_URL` as Product OS target).
3. Compute fingerprint offline:
   `node -e "console.log(require('./src/v2/env-guard').computeHostFingerprint(process.env.PRODUCT_OS_DEV_DATABASE_URL))"`
   Store as `PRODUCT_OS_DEV_HOST_FINGERPRINT`.
4. `pnpm prisma:migrate -- --env neon_dev --mode preflight`
5. After approval to connect: `pnpm prisma:migrate -- --env neon_dev --mode status`
6. After approval to apply: `pnpm prisma:migrate -- --env neon_dev --mode deploy --execute-approved-migration`
7. Verify V1 tables untouched; `pos2_*` empty; no fact import.
