# Product OS — Database-changing entry points inventory (Phase 3A.1)

- Date: 2026-07-18
- Scope: committed project workflows that can change a database or apply migrations
- Policy: Product OS V2 mutations must use `scripts/safe-prisma-migrate.js` only

## @bht/product-os (this package)

| Entry point | Changes DB? | Guarded? | Notes |
|---|---|---|---|
| `pnpm prisma:migrate` → `safe-prisma-migrate.js` | Only `status`/`deploy` modes | **Yes** | `preflight` does not connect; `deploy` requires `--execute-approved-migration` |
| `pnpm prisma:generate` | No | N/A | Client generation only |
| `pnpm prisma:seed` → `prisma db seed` → `prisma/seed.js` | **Yes (V1 seed)** | **No (V1 Legacy)** | Uses Prisma Client + ambient `DATABASE_URL`. Seeds V1 tables only. Not a V2 import path. Documented risk: developers must not point root `DATABASE_URL` at production casually. |
| `pnpm import:excel` | Potentially (script may write) | No V2 guard | Legacy Excel import tooling — out of Phase 3A.1 execute scope; must not be used for V2 facts |
| `pnpm build:product-os` | May connect for online build | No V2 guard | Offline mode available: `build:product-os:offline` |
| `prisma migrate deploy` via package script | — | **Removed** | Former `prisma:migrate:deploy:unguarded` deleted |
| `prisma db push` via package script | — | **Absent** | Scanner fails if reintroduced |

## Root / other packages (not Product OS V2)

| Area | Notes |
|---|---|
| `apps/crm` `db:*` scripts | Many SQL migrations via `pg` + root `DATABASE_URL` — CRM system, not Product OS V2 |
| Root `.env` `DATABASE_URL` | Must never be treated as implicit Product OS V2 target |
| Global developer `npx prisma …` | Cannot be blocked on personal machines; committed workflows are protected |

## Required Product OS URL variables

| Target | URL env | Fingerprint env |
|---|---|---|
| local | `PRODUCT_OS_LOCAL_DATABASE_URL` | `PRODUCT_OS_LOCAL_HOST_FINGERPRINT` (optional unless set) |
| neon_dev | `PRODUCT_OS_DEV_DATABASE_URL` | `PRODUCT_OS_DEV_HOST_FINGERPRINT` (**required**) |
| production | `PRODUCT_OS_PROD_DATABASE_URL` | `PRODUCT_OS_PROD_HOST_FINGERPRINT` (**required**) |

Production also requires `--i-understand-production` and exact confirm `DEPLOY_PRODUCT_OS_TO_PRODUCTION`.

## Scanner enforcement

- `scripts/scan-package-db-scripts.js` — fails CI/tests if unguarded migrate/push scripts return
- `tests/v2/phase3a1-remediation.test.js` — asserts package.json has no unguarded migrate deploy
