# V2.07 Workbook → Phase 1 Target Model Mapping

- Date: 2026-07-18
- Phase: 2
- Sources: `Better_Home_Product_Database_V2.07.xlsx` (immutable) + Phase 1 `target-data-model.md`
- Classification legend: Direct | Rename | Normalize | Split | Derived | Legacy only | Presentation only | Missing target | Missing source | Conflict | Requires Product Owner decision

Sample values are non-secret product facts from the approved workbook.

---

## A. Product Catalogue

| Source sheet | Source column | Meaning | Sample | Target context | Target entity.field | Transform | Stable ID | Authoritative | Legacy | Class | Issue | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 04_Product_Master | Product ID | Stable product code | `C-01` | Product Catalogue | `products.product_code` | Direct | Yes | Yes | No | Direct | — | Prefer over row numbers |
| 04_Product_Master | Code | Same as Product ID | `C-01` | Product Catalogue | `products.product_code` | Rename/duplicate | Yes | Yes | No | Rename | — | Identical to Product ID in all rows |
| 04_Product_Master | Name | Canonical name | `Entry Collection` | Product Catalogue | `products.canonical_name` | Direct | No | Yes | No | Direct | — | |
| 04_Product_Master | Type | Product type label | `Collection` / `Experience Pack` / `Bonus` / `Product Pack` / `Standalone Product` | Product Catalogue | `product_types.code` + `products.product_type_code` | Normalize | No | Yes | Partial | Normalize + Requires PO | ISSUE-008 | Phase 1 four types insufficient; see model correction |
| 04_Product_Master | Version | Product version label | `2.06` | Product Catalogue / Governance | `product_versions.version_label` + release | Conflict vs workbook V2.07 / A4 | No | Partial | No | Conflict | ISSUE-005 | All products `2.06` |
| 04_Product_Master | Status | Lifecycle | `Frozen` | Product Catalogue | `product_statuses` | Normalize | No | Yes | No | Normalize | — | |
| 04_Product_Master | Coverage | Coverage statement | (text) | Product Catalogue | `products.coverage` | Direct | No | Yes | No | Direct | — | Product Language |
| 04_Product_Master | Core Value / Primary Emotion | Positioning | (text) | Product Catalogue | optional product attributes or content | Split | No | Partial | No | Split | — | May stay product attrs |
| 04_Product_Master | Hero Statement | Customer hero | `Some welcomes don't need words.` | Customer Content | `content_entries` | Deprecate as authority | No | **No** (use 14) | Dup | Legacy only / Conflict | ISSUE-013 | Cache only |
| 04_Product_Master | Subtitle | Customer subtitle | … | Customer Content | `content_entries` | Deprecate as authority | No | **No** (use 14) | Dup | Legacy only | ISSUE-013 | |
| 04_Product_Master | Accent Colour | Hex accent | `#B68A4A` | Assets | `theme_tokens` | Deprecate vs Theme Library | No | **No** (use 17) | Dup | Legacy only / Conflict | ISSUE-006 | |
| 04_Product_Master | Final Customer Price incl GST | Price | `$2,499.00` | Pricing | `product_prices.amount` | Prefer 10_Pricing_Summary for A4 | No | Partial | Dup | Derived/Conflict risk | ISSUE-013 | Numeric authority: Pricing Summary |
| 11_Add_Ons | Add-on ID | Add-on stable ID | `AO-013` | Product Catalogue | `products.product_code` (ADDON) or addon code | Direct | Yes | Yes | No | Direct | — | |
| 11_Add_Ons | Canonical Product Name | Add-on name | `Additional Smart Lock` | Product Catalogue | `products.canonical_name` | Direct | No | Yes | No | Direct | — | |
| 11_Add_Ons | Experience Promise | Customer promise | (text) | Customer Content | `content_entries` (experience_promise) | Split | No | Yes (copy) | No | Split | — | Presentation: name + promise |
| 11_Add_Ons | Parent Product ID | Eligibility list | `C-01/C-02/...` | Product Catalogue | `addon_parent_eligibility` | Normalize split | No | Yes | No | Normalize | — | Slash-delimited → rows |
| 11_Add_Ons | Standard Scope Unit | Scope unit | (text) | Product Catalogue / Scope | addon profile / scope | Direct | No | Yes | No | Direct | — | |
| 11_Add_Ons | Customer Price incl GST | Add-on price | `$599` | Pricing | `product_prices` | Direct | No | Yes | No | Direct | — | Missing display modes |
| 11_Add_Ons | Installation Assumptions | Install notes | (text) | Product Catalogue | `installation_assumptions` | Split/Normalize | No | Yes | No | Normalize | — | |
| — | Featured Add-on order | A4 featured list | — | Product Catalogue | `product_featured_addons` | Missing source | — | — | — | Missing source | ISSUE-014 | Needed for A4 |

### Model correction from V2.07 types
Phase 1 assumed types `{FOUNDATION,COLLECTION,EXPERIENCE,ADDON}` only. Workbook also has:
- `Experience Pack` → map to `EXPERIENCE` (ADR-001)
- `Bonus` (E-05 Protection Bonus) → **Requires PO**: product type vs relationship-only bonus
- `Product Pack` (E-06 CCTV) → **Requires PO**: EXPERIENCE vs distinct pack type
- `Standalone Product` (E-07 Smart Toilet) → **Requires PO**: new type or EXPERIENCE/standalone flag + supply-only price

---

## B. Capability, Experiences, Relationships

| Source | Column | Target | Class | Issue | Notes |
|---|---|---|---|---|---|
| 05_Product_Experiences | Product ID, Sequence, Title, Description | `product_experiences` + generate Experience ID | Normalize / Missing target ID | ISSUE-009 | A4 regrouping conflicts |
| 06_Product_Capabilities | Capability, Qty, Notes | `capabilities` + `product_capability_inclusions` + Capability ID | Normalize | ISSUE-009 | |
| 06 / C-03 | Warm Kickboard Zone | capability + scope group mapping | Conflict | ISSUE-002 | A4 Worktop vs Kickboard |
| 06 / C-05 | 6-Circuit Light Switch notes | capability qualifier | Conflict | ISSUE-003 | lighting vs mixed circuits |
| 06 / C-01 | (no door contact) | capability gap vs A4 Door Awareness | Conflict | ISSUE-001 | |
| — | Expand Further / Protection Bonus | `product_relationships` + `relationship_requirements` | Missing source | ISSUE-010 | No relationships sheet |
| 20_Product_Review | Protection free dependency | relationship bonus_unlock | Derived | ISSUE-010 | Confirm Entry+Away+CCTV |

---

## C. Scope and BOM

| Source | Column | Target | Class | Issue | Notes |
|---|---|---|---|---|---|
| 03_SKU_Master | SKU, Unit Cost, Supplier… | `equipment_skus` | Direct | — | Preserve SKU verbatim |
| 07_Product_BOM | Product ID, SKU, Qty, Included/Add-on | `bom_versions` + `bom_items` | Normalize | — | Version BOM separately |
| 07_Product_BOM | Line Cost | derived | Derived | — | Formula field |
| 07 / C-03 | Notes Kickboard | BOM technical note | Conflict | ISSUE-002 | Not customer Worktop label |
| 02_Labour_Library | Labour Item, Hours | `labour_library` | Direct | — | |
| 08_Product_Labour | Qty, costs | `labour_versions` + items | Normalize / Derived | — | Heavy formulas |
| — | Scope group headings | `scope_groups` / `scope_items` | Missing source | ISSUE-011 | A4 headings not in workbook |

---

## D. Rules and Automation

| Source | Column | Target | Class | Issue | Notes |
|---|---|---|---|---|---|
| 09_Product_Rules | Rule Key/Value/Notes | `rule_definitions` + Rule ID + category | Normalize | ISSUE-009 | Free-form |
| 19_Automation_Library | Name, Trigger, Condition, Action | `automation_definitions` + conditions/actions | Split / Normalize | ISSUE-009 | Flattened today |
| 19 / C-06 | (no Return Routine) | automation gap | Conflict / Missing source | ISSUE-004 | A4 claims Return Routine |
| 19 / C-06 | Holiday Mode | automation present | Direct | — | A4 omits Holiday Mode (presentation conflict ISSUE-015) |

---

## E. Pricing

| Source | Column | Target | Class | Issue | Notes |
|---|---|---|---|---|---|
| 01_Settings | Loaded Labour Rate etc. | `costing_settings` | Direct | — | |
| 01_Settings | GST 10% | tax basis reference | Direct | — | Costs ex-GST; prices incl GST |
| 10_Pricing_Summary | Customer Price incl GST | `product_prices.amount` | Direct | — | A4 numeric authority |
| 10_Pricing_Summary | Material/Labour/Direct/GP/Margin | costing views / derived | Derived | — | Do not store as customer facts |
| — | Exact/From/Contact | `price_display_modes` | Missing source | ISSUE-012 | |
| — | Installed/Supply only | `price_fulfilment_modes` | Missing source (partial in Review Notes for E-07) | ISSUE-012 | |
| 04 price column | Final Customer Price | deprecate | Legacy only | ISSUE-013 | |

---

## F. Customer Content

| Source | Column | Target | Class | Issue | Notes |
|---|---|---|---|---|---|
| 14_Content_Library | Product ID, Type, Key, Seq, Title, Body | `content_entries` + placements | Normalize | — | Primary content source |
| 14 | Content Type ∈ {Hero,Subtitle,Story,Footer} | content_types | Missing source for A4 types | ISSUE-016 | Need moments/problem/response/… |
| 14 Story Title | currently product name | `story_title` content | Conflict / Missing | ISSUE-016 | |
| 14 Story Body | differs from A4 | content migration from A4 | Conflict | ISSUE-016 | Migrate exact A4 text later (not this phase) |
| 12_Product_Card_Content | Section/Text | `legacy_product_card_content` | Legacy only | ISSUE-017 | No runtime |
| A4 PDF/MD approved copy | moments/problem/response… | content_entries | Missing source in V2.07 tables | ISSUE-016 | Facts in review/PDF |

---

## G. Assets and Presentation

| Source | Target | Class | Issue | Notes |
|---|---|---|---|---|
| 16_Image_Library File Path | `image_assets.storage_uri` | Partial / Conflict | ISSUE-007 | Generic placeholders |
| — crop/focal/rights | `image_crops` | Missing source | ISSUE-007 | |
| 17_Theme_Library accents | `themes`/`theme_tokens` | Conflict vs A4 green | ISSUE-006 | Channel override needed |
| 18_Layout_Config | `layout_templates`/`layout_configs` | Partial / Conflict | ISSUE-018 | Counts vs A4; relationship flags |
| 15_Icon_Library | optional icons | Presentation only | — | Not required for Collection A4 |

---

## H. Governance / Import

| Source | Target | Class | Notes |
|---|---|---|---|
| 20_Product_Review | releases / validation gate inputs | Normalize | Weak ID (name) |
| CHANGELOG | release notes / provenance | Direct | Documents V2.06 vs V2.07 deltas |
| 13_Roadmap | non-runtime | Presentation/docs | |
| 00_ReadMe | docs | — | |

---

## Mapping coverage statement
- Every V2.07 sheet above is classified.
- Target-model fields with no workbook column are listed as Missing source (scope groups, relationships, price display modes, featured add-ons, A4 content types, asset crops).
- Legacy 12 is not treated as canonical.
- Placeholder JSON definitions were not used as mapping authority.

## Recommended Phase 1 document updates (non-silent)
1. Extend product type discussion for Bonus / Product Pack / Standalone (open PO decisions).
2. Confirm Content Library field expansion matches A4 review C1 (already aligned in Phase 1 design).
3. Emphasize release metadata separate from Product Master Version column.
