# Product OS — Current State Audit (Phase 0)

- Date: 2026-07-18
- Scope: Read-only audit. No schema change, no migration, no DB connection/modification performed.
- Auditor role: Database architect / migration engineer (Phase 0 only).

---

## 0. Required Source Materials — Availability Check

The migration brief lists four documents to read before starting. A workspace-wide
search was performed. **None of the four are present in the workspace.**

| # | Required file | Found? | Notes |
|---|---------------|--------|-------|
| 1 | `Better_Home_Product_Database_V2.07.xlsx` | ❌ Missing | No `*.xlsx` anywhere under `/Users/mengzhang/Downloads/CRM`. |
| 2 | `A4_Content_Mapping_Review_V1.md` | ❌ Missing | Not in repo (checked `docs/`, whole tree). |
| 3 | `Better_Home_Collections_A4_Review_Set_V1.pdf` | ❌ Missing | No `*.pdf` anywhere under the repo root. |
| 4 | `Better_Home_Product_Database` (any version) | ❌ Missing | No matching file. |

Consequence and guardrail:
- The Excel↔DB and A4↔DB comparisons requested in Phase 0 **cannot be completed
  factually**. They are therefore marked **BLOCKED — awaiting source files** below.
- Per the brief ("if these files are not in the workspace, list the missing files,
  do not guess"), no content of these files has been inferred or invented.

Present non-source artifacts at repo root (for reference only, not product sources):
- `BHT-GoogleAds-API-Design-Doc.docx` (unrelated: Google Ads)
- `_tmp_20_bd468e8379065ba32a42c76986d0426a` (empty temp file)

---

## 1. Project Structure

Monorepo root: `crm-system/` (pnpm workspaces, package manager `pnpm@9`).

Workspace globs (`pnpm-workspace.yaml`): `apps/*`, `apps/web/*`, `packages/*`.

Product OS lives in a single dedicated package:

```
crm-system/packages/product-os/
├── package.json                # @bht/product-os
├── README.md                   # Product OS governance + workflow docs
├── definitions/                # SOURCE OF TRUTH (7 product JSON files)
│   ├── foundation.json
│   ├── entry.json
│   ├── living.json
│   ├── kitchen.json
│   ├── bedroom.json
│   ├── bathroom.json
│   └── away.json
├── prisma/
│   ├── schema.prisma           # 14 models + 3 enums
│   ├── seed.js                 # legacy manual seed (settings + 7 products)
│   ├── migrations/
│   │   └── 20260708201000_init_product_os/migration.sql
│   └── generated/              # build artifacts (reports + seed snapshot)
│       ├── product-seed-data.json
│       ├── validation-report.json
│       ├── definition-completion-report.json
│       ├── questions-report.md
│       └── pdc-gap-report.md
├── scripts/
│   ├── build-product-os.js             # definitions -> snapshot -> DB (+reports)
│   ├── validate-product-definitions.js
│   ├── generate-definition-completion-report.js
│   ├── generate-questions-report.js
│   ├── import-excel.js                 # generic xlsx -> DB importer
│   ├── scan-product-table-access.js    # governance: direct-table-access audit
│   └── lib/
│       ├── product-definition-utils.js
│       └── definition-markers.js
└── src/
    ├── index.js                        # createProductOsContext()
    ├── prisma-client.js
    ├── repositories/product-repository.js
    └── services/product-service.js
```

Other apps in the monorepo (`apps/crm`, `apps/web`, `apps/essential-report`, etc.)
are **not** consumers of `@bht/product-os`. A search for `product-os` /
`ProductService` / `createProductOsContext` under `apps/` returned **no matches** —
so today Product OS has **no downstream consumer** and **no HTTP API**.

---

## 2. Technology Stack (confirmed)

| Concern | Technology | Evidence |
|---|---|---|
| Database engine | PostgreSQL (Neon) | `schema.prisma` provider `postgresql`; root `.env` `DATABASE_URL` host references `neon`. |
| ORM | **Prisma** `^6.11.1` (resolved 6.19.3) | `packages/product-os/package.json`, `schema.prisma`. |
| Runtime | Node.js (CommonJS) | scripts use `require(...)`; repo `engines.node >=18`. |
| Language | JavaScript (no TypeScript in product-os) | all `.js`, no `.ts` / type defs in package. |
| DB access driver | Prisma Client (`@prisma/client`) | `src/prisma-client.js` singleton. |
| Excel parsing | `xlsx` `^0.18.5` | `scripts/import-excel.js`. |
| API framework | **None for Product OS** | no Express/Next route references the package. |
| Other stacks in monorepo | Astro (`apps/web`), Node CRM API (`apps/crm`), Netlify functions | not part of Product OS. |

Not used anywhere in Product OS: Drizzle, Supabase client, raw-SQL migration runner
(the CRM app uses raw SQL migrations under `apps/crm/database/`, but that is a
separate database domain and out of Product OS scope).

---

## 3. Neon Connection Status

- `DATABASE_URL` exists in root `.env` and its host **references Neon** (verified
  without printing the secret).
- `DATABASE_SSL` key present in `.env` / `.env.example`.
- Prisma reads `env("DATABASE_URL")` directly.
- The Product OS package has been exercised only in **offline mode**
  (`build:product-os:offline`) in prior work; there is no evidence of a completed
  `prisma migrate deploy` against Neon for this package (no `_prisma_migrations`
  verification was performed in this audit — DB was intentionally not contacted).

Conclusion: Neon is configured, but whether the current Product OS schema has been
physically applied to a Neon branch is **unverified** and must be checked live in a
later phase (with approval).

---

## 4. Current Schema — Tables, Fields, Keys, Constraints, Indexes

Source: `prisma/schema.prisma` + `migrations/20260708201000_init_product_os/migration.sql`
(the two are consistent). One SQL VIEW also exists.

### Enums
- `product_type`: `INFRASTRUCTURE`, `COLLECTION`, `EXPERIENCE_PACK`
- `record_status`: `DRAFT`, `ACTIVE`, `FROZEN`, `ARCHIVED`
- `included_type`: `STANDARD`, `OPTIONAL`, `UPGRADE`

### Tables (14) + 1 View

| Table | PK | Key columns | Unique | FK (onDelete) | Index |
|---|---|---|---|---|---|
| `settings` | `id` uuid | `setting_key`, numeric/text/boolean value | `setting_key` | — | — |
| `product_catalog` | `id` uuid | `code`, `type`, `name`, `version`, `status`, `core_value`, `primary_emotion`, `coverage`, `hero`, `subtitle`, `story`, `final_installed_price`, `requires_foundation`, `notes` | `code` | — | `(type,status)` |
| `sku_library` | `id` uuid | `sku`, `product_name`, `category`, `brand`, `supplier`, `unit_cost_ex_gst`, `status` | `sku` | — | — |
| `labour_library` | `id` uuid | `labour_item`, `hours`, `category` | `labour_item` | — | — |
| `product_bom` | `id` uuid | `qty`, `included_type` | `(product_id, sku_id)` | product→CASCADE, sku→RESTRICT | — |
| `product_labour` | `id` uuid | `qty` | `(product_id, labour_item_id)` | product→CASCADE, labour→RESTRICT | — |
| `product_experiences` | `id` uuid | `sequence`, `title`, `description`, `status` | `(product_id, sequence)` | product→CASCADE | — |
| `product_capabilities` | `id` uuid | `capability`, `included_qty`, `customer_layer` | — | product→CASCADE | — |
| `product_rules` | `id` uuid | `rule_key`, `rule_value` | `(product_id, rule_key)` | product→CASCADE | — |
| `product_content` | `id` uuid | `content_type`, `content_key`, `sequence`, `title`, `body`, `status` | `(product_id, content_type, content_key, sequence)` | product→CASCADE | — |
| `product_icons` | `id` uuid | `icon_key`, `title`, `asset_url`, `sequence` | `(product_id, icon_key, sequence)` | product→CASCADE | — |
| `product_images` | `id` uuid | `image_type`, `image_url`, `alt_text`, `sequence` | `(product_id, image_type, sequence)` | product→CASCADE | — |
| `product_theme` | `id` uuid | `theme_key`, `primary_color`, `secondary_color`, `typography_scheme` | `(product_id, theme_key)` | product→CASCADE | — |
| `product_layout` | `id` uuid | `layout_key`, `render_target`, `definition` (JSONB) | `(product_id, layout_key)` | product→CASCADE | — |
| `product_automation` | `id` uuid | `automation_key`, `sequence`, `title`, `description`, `trigger_type` | `(product_id, automation_key, sequence)` | product→CASCADE | — |
| `change_log` | `id` uuid | `changed_by`, `change_type`, `change_summary`, `previous/new_version`, `metadata` (JSONB) | — | product→SET NULL | `(product_id, changed_at)` |
| `product_pricing_summary` (VIEW) | — | derived: material_cost, labour_cost, direct_cost, installed_price, gross_profit, gross_margin | — | — | — |

### Pricing view logic
`product_pricing_summary` computes cost/margin live from `product_bom × sku_library.unit_cost_ex_gst`
and `product_labour × labour_library.hours × settings.loaded_labour_rate`. Nothing is stored.

---

## 5. Current Data (from generated seed snapshot, not live DB)

7 products, all `status = FROZEN`, version `1.0`:

| Code | Type | Price | Exp | BOM | Labour | Content | Autom |
|---|---|---:|---:|---:|---:|---:|---:|
| FOUNDATION | INFRASTRUCTURE | 4999 | 2 | 3 | 4 | 6 | 2 |
| ENTRY | COLLECTION | 2499 | 4 | 4 | 4 | 8 | 2 |
| LIVING | COLLECTION | 2999 | 4 | 4 | 4 | 8 | 2 |
| KITCHEN | COLLECTION | 2499 | 4 | 4 | 4 | 8 | 2 |
| BEDROOM | COLLECTION | 2699 | 4 | 4 | 4 | 8 | 2 |
| BATHROOM | COLLECTION | 2199 | 4 | 4 | 4 | 8 | 2 |
| AWAY | COLLECTION | 2499 | 4 | 4 | 4 | 8 | 2 |

Important caveat: these definition JSONs currently contain **placeholder SKUs and
`unit_cost_ex_gst = 0`** plus multiple `TODO` markers (see
`prisma/generated/questions-report.md`, 43 open questions). They are **not** the
approved V2.07 product facts. They must not be treated as the migration source.

---

## 6. Application / API / Seed / Connection Code Inventory

| Layer | File | Status |
|---|---|---|
| DB connection | `src/prisma-client.js` | Prisma singleton via global. |
| Repository | `src/repositories/product-repository.js` | `findByCode`, `findPricing*`, `listProducts`, `createChangeLog`. |
| Service | `src/services/product-service.js` | print / proposal / configurator / AI / pricing read models (in-process, not HTTP). |
| Context factory | `src/index.js` | `createProductOsContext()`. |
| Seed (manual) | `prisma/seed.js` | legacy; superseded by definitions build. |
| Build pipeline | `scripts/build-product-os.js` | definitions → snapshot → DB, auto-emits 3 reports. |
| Validator | `scripts/validate-product-definitions.js` | structural + reference checks. |
| Reports | `generate-definition-completion-report.js`, `generate-questions-report.js` | governance reports. |
| Excel importer | `scripts/import-excel.js` | generic sheet→table upsert (Prisma). |
| Governance | `scripts/scan-product-table-access.js` | forbids direct table access in apps. |
| HTTP API | — | **does not exist**. |

---

## 7. Comparison Tasks Requested by Phase 0

### 7a. Current schema vs Excel Product OS (V2.07)
**BLOCKED — source missing.** `Better_Home_Product_Database_V2.07.xlsx` is not in
the workspace, so no factual sheet-by-sheet comparison can be produced. A
preliminary, *structural* gap analysis against the migration brief's target model is
in `schema-gap-analysis.md`, clearly labelled as brief-derived (not Excel-derived).

### 7b. Current schema vs `A4_Content_Mapping_Review_V1.md`
**BLOCKED — source missing.** The A4 content-mapping review is not in the workspace.
Content-model gaps (single `product_content` table vs the required Surface / Side /
Locale / Version content library) are noted in `schema-gap-analysis.md` from the
brief's Phase 4/7 requirements only.

---

## 8. Key Findings Summary

1. Product OS is a **single-package, Prisma-on-Postgres(Neon)** system with a clean
   definitions→build→reports pipeline, but **no API and no downstream consumers yet**.
2. The current model is a **flat, single-version, single-locale, single-surface**
   product model. It has **no** first-class support for: versioned price books,
   product relationships, add-ons with parent eligibility, multi-surface/locale
   content, automation condition/action decomposition, releases, validation results,
   or migration issue tracking — all of which the V2 brief requires.
3. Product hierarchy enum already uses `EXPERIENCE_PACK` (not `ENHANCEMENT`) but the
   brief mandates the canonical hierarchy **Foundation → Collection → Experience →
   Add-on**; "Add-on" is not yet a first-class entity.
4. The three-language separation (Customer / Product / Technical) is **not modelled** —
   customer copy, product/sales facts and technical BOM currently coexist on
   `product_catalog` + loosely-typed `product_content`.
5. The four authoritative source files are **absent**, which blocks all fact-level
   comparison and all data migration. This is the single biggest blocker.
6. Whether the schema is physically deployed to Neon is **unverified** (DB not
   contacted in this read-only phase).

---

## 9. This phase changed nothing

- No schema modified. No migration run. No DB connection opened. No files deleted.
- Only three audit documents were added under `docs/product-os/`.
