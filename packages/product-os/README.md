# Better Home Product OS (Database)

Better Home Product OS is the **single source of truth** for product data.
In Phase 4, the **real source of truth** is Product Definition JSON in git.

This module only contains:
- PostgreSQL schema (Neon-ready)
- Prisma ORM schema
- SQL migration
- Seed script
- Pricing view
- Product Definition Layer (`definitions/*.json`)
- Product Definition Validator
- Product OS Builder (definition -> seed snapshot -> database sync)

No frontend, no React, no website pages.

## Product OS Workflow (Phase 4)

Product Definition (JSON in git)
-> Validator
-> Seed Generator Snapshot
-> Neon Database
-> Product Service
-> Website / Proposal / Print Engine / CRM / AI / Configurator

Important:
- Excel is not source of truth.
- Neon database is not source of truth.
- Seed file is not source of truth.
- Only `definitions/*.json` is source of truth.
- Product OS v1.0 release rule: any product below 100% definition completion blocks release.
- 100% completion requires: validation pass + no TODO/UNKNOWN/QUESTION/MISSING markers.

## Scope

This database models product layers:
- Foundation: infrastructure backbone
- Collections: `Entry`, `Living`, `Kitchen`, `Bedroom`, `Bathroom`, `Away`
- Experience Packs: lifestyle packs (E-01…E-06 canonical; E-05=CCTV, E-06=Smart Toilet; Protection is included benefit — DEC-013)
- Add-ons: optional line-item expansion

Design principles implemented:
- Product describes capability, not brand.
- SKU is independent and stores brand/supplier/cost.
- Collection defaults to `requires_foundation = true`.
- No product dependency table.
- Material/Labour/Margin are calculated in a view (not stored columns).

## Files

- Prisma schema: `prisma/schema.prisma`
- Migration SQL: `prisma/migrations/20260708201000_init_product_os/migration.sql`
- Seed script: `prisma/seed.js`

## Environment

V1 tooling may still read `DATABASE_URL`. Product OS V2 migrations must use `PRODUCT_OS_*_DATABASE_URL` via the guarded runner only.

Legacy note — Set `DATABASE_URL` for V1 scripts, for example:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require"
```

## Run

From repo root:

```bash
pnpm install
pnpm --filter @bht/product-os prisma:generate
pnpm --filter @bht/product-os prisma:migrate -- --env neon_dev --mode preflight
# Guarded runner only. Never uses root DATABASE_URL as Product OS target.
# Deploy requires Phase 3B approval + --mode deploy --execute-approved-migration
pnpm --filter @bht/product-os prisma:seed
```

## Product Definition Layer

Definition files:
- `definitions/foundation.json`
- `definitions/living.json`
- `definitions/entry.json`
- `definitions/bedroom.json`
- `definitions/kitchen.json`
- `definitions/bathroom.json`
- `definitions/away.json`

Each product JSON includes:
- `product`
- `hero`
- `subtitle`
- `story`
- `experiences`
- `capabilities`
- `bom`
- `labour`
- `pricing`
- `content`
- `automation`
- `icons`
- `theme`
- `layout`
- `images`
- `rules`
- `notes`

## Validate Product Definitions

```bash
pnpm --filter @bht/product-os validate:definitions
```

Validation checks:
- JSON key completeness (required top-level keys)
- Product code format and duplicates
- Duplicate SKU in BOM
- Duplicate capability
- Missing SKU reference
- Missing labour reference
- Empty hero
- Empty subtitle
- Experience count range
- Pricing existence

Validation report output:
- `prisma/generated/validation-report.json`

## Build Product OS From Definitions

```bash
pnpm --filter @bht/product-os build:product-os
pnpm --filter @bht/product-os build:product-os -- --dry-run
pnpm --filter @bht/product-os build:product-os:offline
```

Builder behavior:
- Read all `definitions/*.json`
- Generate seed snapshot file: `prisma/generated/product-seed-data.json`
- `build:product-os`: generate snapshot and upsert Product OS runtime data into Neon
- `build:product-os -- --dry-run`: generate snapshot, connect database, but rollback transaction
- `build:product-os:offline`: only generate snapshot, no database connection, no `DATABASE_URL` required
- Every build now auto-generates:
  - `validation-report.json`
  - `definition-completion-report.json`
  - `questions-report.md`
- If there are no unresolved markers and completion is 100% for all products, build prints:
  - `Product Ready For Release`

## Product Definition Completion Report

```bash
pnpm --filter @bht/product-os report:definition-completion
```

Report output:
- `prisma/generated/definition-completion-report.json`

Report includes per product:
- Product Name
- Hero
- Subtitle
- Story
- Experiences
- Capabilities
- BOM
- Labour
- Pricing
- Content
- Automation
- Icons
- Theme
- Layout
- Images
- Rules
- Completion %

## Product Questions Report

```bash
pnpm --filter @bht/product-os report:questions
```

Report output:
- `prisma/generated/questions-report.md`

Tracked keywords:
- `TODO`
- `UNKNOWN`
- `QUESTION`
- `MISSING`

If none exist, output contains:
- `Product Ready For Release`

## Excel -> Product OS Import Tool

`import:excel` will read sheets and import into Product OS tables in a single transaction.
It supports dry-run mode and idempotent upsert for key tables.
This tool is for migration/import convenience only and is not source of truth.

```bash
pnpm --filter @bht/product-os import:excel -- --file ./data/product-os.xlsx
pnpm --filter @bht/product-os import:excel -- --file ./data/product-os.xlsx --dry-run
```

Supported sheet names:
- `settings`
- `product_catalog`
- `sku_library`
- `labour_library`
- `product_bom`
- `product_labour`
- `product_experiences`
- `product_capabilities`
- `product_rules`
- `product_content`
- `product_icons`
- `product_images`
- `product_theme`
- `product_layout`
- `product_automation`
- `change_log`

Reference mapping rules:
- Columns can be snake_case with flexible separators; importer normalizes headers.
- Child sheets can reference product via `product_id` or `product_code`.
- `product_bom` can reference SKU via `sku_id` or `sku`.
- `product_labour` can reference labour via `labour_item_id` or `labour_item`.

## Product Repository + Product Service

From now on, all systems should consume product data through this package API.
All applications are required to access Product OS data through `@bht/product-os` service methods.
Direct SQL/table access to Product OS tables from app/business modules is not allowed.

```js
const { createProductOsContext } = require("@bht/product-os");

async function demo() {
  const { services } = createProductOsContext();
  const card = await services.productService.getProductCardByCode("LIVING");
  console.log(card);
}
```

Service methods:
- `getProductCardByCode(code)` -> returns product + pricing summary
- `getPricingSummary(productCode)` -> stable pricing payload
- `getProductForPrint(productCode)` -> print-focused payload
- `getProductForProposal(productCode)` -> proposal-focused payload
- `getProductForConfigurator(filters)` -> configurator list payload
- `getProductForAIContext(productCode)` -> AI context payload
- `listCatalog(filters)` -> list by `type` / `status` / `requiresFoundation`
- `logVersionChange(payload)` -> write into `change_log`

## Access Boundary Audit

Use this script to detect direct Product OS table access across `apps/` and `packages/`.
This script only reports findings and does not modify any business code.

```bash
pnpm --filter @bht/product-os scan-product-table-access
```

## Seeded Products

All seeded with status `FROZEN`:
- Foundation: `4999`
- Living: `2999`
- Entry: `2499`
- Kitchen: `2499`
- Bedroom: `2699`
- Bathroom: `2199`
- Away: `2499`

## Pricing View

View name: `product_pricing_summary`

Calculated in real time:
- Material Cost
- Labour Cost
- Direct Cost
- Installed Price
- Gross Profit
- Gross Margin

## SQL Example: Query Single Product

```sql
SELECT
  p.id,
  p.code,
  p.type,
  p.name,
  p.version,
  p.status,
  p.requires_foundation,
  p.final_installed_price,
  ps.material_cost,
  ps.labour_cost,
  ps.direct_cost,
  ps.installed_price,
  ps.gross_profit,
  ps.gross_margin
FROM product_catalog p
LEFT JOIN product_pricing_summary ps ON ps.product_id = p.id
WHERE p.code = 'LIVING';
```

## SQL Example: Full Product Card (Content + BOM + Labour + Automation)

```sql
SELECT jsonb_build_object(
  'product', to_jsonb(p),
  'pricing', to_jsonb(ps),
  'content', COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(pc) ORDER BY pc.sequence)
      FROM product_content pc
      WHERE pc.product_id = p.id
    ),
    '[]'::jsonb
  ),
  'bom', COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', pb.id,
          'qty', pb.qty,
          'included_type', pb.included_type,
          'notes', pb.notes,
          'sku', to_jsonb(s)
        )
      )
      FROM product_bom pb
      JOIN sku_library s ON s.id = pb.sku_id
      WHERE pb.product_id = p.id
    ),
    '[]'::jsonb
  ),
  'labour', COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', pl.id,
          'qty', pl.qty,
          'notes', pl.notes,
          'labour_item', to_jsonb(ll)
        )
      )
      FROM product_labour pl
      JOIN labour_library ll ON ll.id = pl.labour_item_id
      WHERE pl.product_id = p.id
    ),
    '[]'::jsonb
  ),
  'automation', COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(pa) ORDER BY pa.sequence)
      FROM product_automation pa
      WHERE pa.product_id = p.id
    ),
    '[]'::jsonb
  )
) AS product_card
FROM product_catalog p
LEFT JOIN product_pricing_summary ps ON ps.product_id = p.id
WHERE p.code = 'FOUNDATION';
```
