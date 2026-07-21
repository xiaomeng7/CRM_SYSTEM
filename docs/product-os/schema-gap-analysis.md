# Product OS — Schema Gap Analysis (Phase 0)

- Date: 2026-07-18
- Basis: current `schema.prisma` vs the **migration brief's** target entity list
  (Phase 1) and content requirements (Phase 4/7).
- IMPORTANT: The Excel `V2.07` and `A4_Content_Mapping_Review_V1.md` are **not in the
  workspace**. Every gap below is derived from the written brief only, **not** from
  the actual source files. Fact-level (values, counts, SKUs, prices) gaps cannot be
  assessed until those files are provided.

Legend: ✅ exists / ⚠️ partial / ❌ missing.

---

## 1. Core Product

| Target entity | Status | Current mapping / gap |
|---|---|---|
| `products` | ⚠️ | `product_catalog` exists but mixes identity + customer copy + pricing in one row. |
| `product_versions` | ❌ | Only a `version` string column; no version table, no per-version snapshots. |
| `product_types` | ⚠️ | Modelled as enum `product_type`, not a table; brief lists it as an entity (lookup table). |
| `product_statuses` | ⚠️ | Enum `record_status`, not a table. |

## 2. Customer Content

| Target entity | Status | Gap |
|---|---|---|
| `content_entries` | ⚠️ | `product_content` is close but lacks surface/side/locale/version as first-class columns. |
| `content_types` | ⚠️ | Free-text `content_type`, not a controlled table. |
| `content_surfaces` | ❌ | No surface dimension (a4 / website / proposal…). |
| `content_locales` | ❌ | No locale dimension (single language assumed). |
| Front/Back side | ❌ | No "side" concept for A4 front/back. |

Also missing per brief: explicit `12_Product_Card_Content` **Legacy** archive table
and `14_Content_Library` main content source semantics.

## 3. Experiences & Capabilities

| Target entity | Status | Gap |
|---|---|---|
| `product_experiences` | ✅ | Exists (stable uuid PK, `(product_id,sequence)` unique). |
| `product_capabilities` | ⚠️ | Exists but no stable link to BOM/rule that "supports" the capability. |
| `product_scope_groups` | ❌ | No scope grouping. |
| `product_scope_items` | ❌ | No scope items; A4 "standard scope" not modelled → capability link missing. |

## 4. Product Relationships

| Target entity | Status | Gap |
|---|---|---|
| `product_relationships` | ❌ | No relationship table at all. |
| `relationship_types` | ❌ | Missing; brief needs compatible_experience / cross_sell / dependency / bonus_unlock / mutually_exclusive. |
| `relationship_requirements` | ❌ | Missing; e.g. Protection Bonus = Entry + Away + CCTV cannot be expressed. |

Today "requires_foundation" is a single boolean on `product_catalog` — cannot express
multi-product dependencies or bonus unlocks.

## 5. Add-ons

| Target entity | Status | Gap |
|---|---|---|
| `addons` | ❌ | No add-on entity. |
| `addon_parent_eligibility` | ❌ | No parent eligibility constraint. |
| `product_featured_addons` | ❌ | No featured add-on link. |

This is a **major** gap: the canonical hierarchy Foundation → Collection → Experience
→ **Add-on** is not representable. `EXPERIENCE_PACK` enum value is not an add-on model.

## 6. Technical & Costing

| Target entity | Status | Gap |
|---|---|---|
| `skus` | ✅ | `sku_library` (unique `sku`, `unit_cost_ex_gst`). |
| `product_bom_items` | ✅ | `product_bom` (`qty`, `included_type`). |
| `labour_library` | ✅ | Exists (`hours`, `category`). |
| `product_labour_items` | ✅ | `product_labour` (`qty`). |

Costing structure is the **most complete** part of the current model. Gaps are
metadata (protocol, technician instructions, technical notes) not yet on SKU/BOM.

## 7. Rules & Automation

| Target entity | Status | Gap |
|---|---|---|
| `product_rules` | ⚠️ | Exists as loose `rule_key`/`rule_value` strings only. |
| `automation_definitions` | ⚠️ | `product_automation` exists but automation is per-product, not a reusable canonical library. |
| `automation_conditions` | ❌ | Trigger/condition/action are flattened into text fields; not decomposed. |
| `automation_actions` | ❌ | Same — no structured action rows. |

Directly relevant to the brief's Away "Return Routine" issue: no canonical automation
library to point the A4 routine at.

## 8. Pricing

| Target entity | Status | Gap |
|---|---|---|
| `price_books` | ❌ | None. Price is one column `final_installed_price` on the product. |
| `product_prices` | ❌ | No price rows; cannot hold currency/tax basis/effective date/version. |
| `addon_prices` | ❌ | None. |
| `price_display_policies` | ❌ | No exact/from/contact, no installed/supply-only, no GST basis field. |

Current pricing cannot express: currency, tax basis, exact/from/contact,
installed vs supply-only, effective date, price status, or price version. This is a
**major** gap for Proposal/Quote/Contract.

## 9. Visual System

| Target entity | Status | Gap |
|---|---|---|
| `image_assets` | ⚠️ | `product_images` stores URLs per product; no shared asset library / crop/approval metadata. |
| `themes` | ⚠️ | `product_theme` is per-product colours; no shared theme entity. |
| `theme_tokens` | ❌ | No token model. |
| `layout_templates` | ❌ | `product_layout` holds a JSONB per product; no shared template catalogue. |
| `layout_configs` | ⚠️ | Only the per-product JSONB `definition`. |

## 10. Governance

| Target entity | Status | Gap |
|---|---|---|
| `releases` | ❌ | No release entity (A4 version vs OS version cannot be reconciled in-DB). |
| `validation_results` | ❌ | Validation output is written to files, not persisted in DB. |
| `migration_issues` | ❌ | No issue register table (Phase 2 requires one). |
| `audit_log` | ⚠️ | `change_log` exists but is product-scoped and informal. |

---

## 11. Stable-ID Requirement

Brief requires stable IDs for Product, Product Version, Content Entry, Experience,
Capability, Rule, Automation, Relationship, Add-on, SKU, Image Asset, Theme, Layout,
and forbids using titles/sequence/customer copy as foreign keys.

Current state:
- ✅ All existing tables use `uuid` surrogate PKs (good).
- ⚠️ Cross-references in `definitions/*.json` currently join BOM/labour by
  **business string** (`sku`, `labour_item`) at build time — acceptable for import
  but the runtime FKs are uuid, which is correct.
- ❌ Missing entities (versions, relationships, add-ons, price rows, releases,
  issues) have no IDs yet.

---

## 12. Three-Language Separation Gap

The brief mandates strict separation of Customer / Product / Technical language.

Current model **violates** this by co-locating on `product_catalog`:
- Customer: `hero`, `subtitle`, `story` (+ `product_content`)
- Product/sales: `name`, `coverage`, `final_installed_price`, `requires_foundation`
- Technical: reached via `product_bom`/`product_labour`/`sku_library` (this part is
  reasonably separated already).

Target: customer copy must move fully into a content library (surface/side/locale/
version aware); product/sales facts and technical facts must be distinct and never
sourced from customer copy.

---

## 13. Gap Severity Ranking (structural, brief-derived)

| Severity | Gaps |
|---|---|
| **P0 (blocks V2)** | Missing source files (Excel/A4); no price_books/product_prices; no add-ons + eligibility; no product_relationships; no migration_issues register. |
| **P1 (major)** | Content library lacks surface/side/locale/version; no product_versions; no releases; automation not decomposed. |
| **P2 (moderate)** | product_types/statuses as lookup tables; shared image/theme/layout libraries; scope groups/items; capability↔support link. |
| **P3 (minor)** | technical metadata on SKU/BOM (protocol, technician instructions); audit_log formalisation. |

---

## 14. What cannot be concluded yet

- Any **value-level** gap (product counts, SKU counts, BOM quantities, prices, GST,
  scope wording) is **unknown** until `Better_Home_Product_Database_V2.07.xlsx` and
  the A4 files are supplied.
- The current 7 definition JSONs use placeholder SKUs and zero costs and must not be
  used as the V2.07 baseline.
