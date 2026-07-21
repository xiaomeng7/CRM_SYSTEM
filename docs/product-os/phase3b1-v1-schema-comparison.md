# Phase 3B.1 — V1 Schema Comparison (Four Sources)

- Date: 2026-07-18
- Target: `neon_dev` / declared branch `product-os-v2-dev`
- Fingerprint: `sha256:69cc4ddcb715dd93338d45a79f6135deef25124af23b069380ccd52e071df9ab`
- Sources:
  - **A** Actual Neon DEV `public` schema (read-only inventory)
  - **B** Prisma V1 models in `packages/product-os/prisma/schema.prisma` (excludes `Pos2*`)
  - **C** V1 migration SQL `20260708201000_init_product_os/migration.sql`
  - **D** `_prisma_migrations` history on Neon DEV

## Classification legend

| Code | Meaning |
|---|---|
| `EXACT_MATCH` | Present and structurally aligned across compared sources |
| `SEMANTIC_MATCH` | Equivalent intent with non-material representation differences |
| `DB_ONLY` | Present in DB but not in Product OS V1 Prisma/migration |
| `PRISMA_ONLY` | In Prisma V1 models but not in DB |
| `MIGRATION_ONLY` | Created by V1 migration SQL but not in DB |
| `MISSING_IN_DB` | Expected by Prisma and/or migration; absent in DB |
| `DRIFT` | Present in multiple sources but attributes differ |
| `UNKNOWN` | Insufficient evidence |

## Migration history (Source D)

| Check | Result |
|---|---|
| `_prisma_migrations` exists | **No** |
| Rows | n/a |
| `20260708201000_init_product_os` recorded | **No** |
| `20260718120000_add_product_os_v2_schema` recorded | **No** |

History column for objects below is therefore **not recorded** / n/a.

## Enums

| Object | Actual DB | Prisma V1 | V1 Migration | Migration History | Result |
|---|---|---|---|---|---|
| `product_type` | missing | match (INFRASTRUCTURE, COLLECTION, EXPERIENCE_PACK) | creates same members/order | not recorded | `MISSING_IN_DB` |
| `record_status` | missing | match (DRAFT, ACTIVE, FROZEN, ARCHIVED) | creates same members/order | not recorded | `MISSING_IN_DB` |
| `included_type` | missing | match (STANDARD, OPTIONAL, UPGRADE) | creates same members/order | not recorded | `MISSING_IN_DB` |

No other Product OS V1 enums expected. DB has **0** public enums (CRM may use text/check patterns instead).

## Tables

| Object | Actual DB | Prisma V1 | V1 Migration | Migration History | Result |
|---|---|---|---|---|---|
| `settings` | missing | mapped `Setting` | creates | not recorded | `MISSING_IN_DB` |
| `product_catalog` | missing | mapped `ProductCatalog` | creates | not recorded | `MISSING_IN_DB` |
| `sku_library` | missing | mapped `SkuLibrary` | creates | not recorded | `MISSING_IN_DB` |
| `labour_library` | missing | mapped `LabourLibrary` | creates | not recorded | `MISSING_IN_DB` |
| `product_bom` | missing | mapped `ProductBom` | creates | not recorded | `MISSING_IN_DB` |
| `product_labour` | missing | mapped `ProductLabour` | creates | not recorded | `MISSING_IN_DB` |
| `product_experiences` | missing | mapped `ProductExperience` | creates | not recorded | `MISSING_IN_DB` |
| `product_capabilities` | missing | mapped `ProductCapability` | creates | not recorded | `MISSING_IN_DB` |
| `product_rules` | missing | mapped `ProductRule` | creates | not recorded | `MISSING_IN_DB` |
| `product_content` | missing | mapped `ProductContent` | creates | not recorded | `MISSING_IN_DB` |
| `product_icons` | missing | mapped `ProductIcon` | creates | not recorded | `MISSING_IN_DB` |
| `product_images` | missing | mapped `ProductImage` | creates | not recorded | `MISSING_IN_DB` |
| `product_theme` | missing | mapped `ProductTheme` | creates | not recorded | `MISSING_IN_DB` |
| `product_layout` | missing | mapped `ProductLayout` | creates | not recorded | `MISSING_IN_DB` |
| `product_automation` | missing | mapped `ProductAutomation` | creates | not recorded | `MISSING_IN_DB` |
| `change_log` | missing | mapped `ChangeLog` | creates | not recorded | `MISSING_IN_DB` |

### Attribute comparison note

Column-level / FK / index / default comparison for V1 objects is **not applicable** (objects absent).  
Prisma V1 ↔ V1 migration SQL were spot-checked for expected table set and remain aligned with each other (both describe the same 16 tables + 3 enums + 1 view). That pair is **EXACT_MATCH** relative to each other; both are **MISSING_IN_DB** relative to Neon DEV.

## Views

| Object | Actual DB | Prisma V1 | V1 Migration | Migration History | Result |
|---|---|---|---|---|---|
| `product_pricing_summary` | missing | n/a (not a Prisma model) | creates | not recorded | `MISSING_IN_DB` |

## Indexes / constraints (V1 expected)

Because base tables are absent, all V1 PK/FK/UNIQUE/CHECK/INDEX objects from the migration are **MISSING_IN_DB**.

Notable expected artifacts (for future deploy verification):

| Artifact | Migration creates |
|---|---|
| `product_catalog_type_status_idx` | yes |
| `change_log_product_id_changed_at_idx` | yes |
| FKs from BOM/labour/content/… → `product_catalog` | yes (ON DELETE CASCADE / RESTRICT / SET NULL per SQL) |
| UNIQUE pairs (e.g. `product_bom(product_id, sku_id)`) | yes |

## DB_ONLY objects (CRM inheritance — out of Product OS V1 scope)

Neon DEV contains **72** non–Product-OS tables and **10** CRM views. Examples:

| Kind | Examples | Result vs Product OS V1 |
|---|---|---|
| Tables | `accounts`, `contacts`, `customers`, `leads`, `jobs`, `quotes`, … | `DB_ONLY` |
| Views | `crm_account_summary`, `v_opportunity_pipeline_summary`, … | `DB_ONLY` |

These are consistent with branching from CRM `production`. They are **not** Product OS V1 drift.

## Prisma V1 ↔ Migration SQL cross-check

| Concern | Result |
|---|---|
| Table set | Aligned (16 tables) |
| Enum set / members | Aligned |
| View | Migration-only (`product_pricing_summary`); not modeled in Prisma (acceptable for V1) |
| Naming (`@@map`) | Aligned |

## Scenario determination input

| Question | Answer |
|---|---|
| Is V1 structure present and matching migration? | **No** |
| Is only migration history missing? | **No** (schema itself missing; history table missing) |
| Is V1 partially present with attribute drift? | **No** |
| Is V1 absent? | **Yes** |

→ **Scenario C**
