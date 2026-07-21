# Product OS V2 — Field Ownership Matrix

- Date: 2026-07-18
- Phase: 1 design; Phase 2 reconciliation; **Phase 2A PO decisions applied**
- Purpose: Prevent Customer Language, Product Language, Technical Language, and
  Presentation layers from owning each other's facts.
- Authority: DEC-001…012 + ADR-005…007 supersede prior recommendations where noted.

Legend:
- **Owner** = authoritative store
- **May reference** = FK / content placement / release pin only
- **Forbidden** = must never be stored or redefined there

---

## 1. Identity and hierarchy

| Fact | Owner context / table | May reference | Forbidden owners |
|---|---|---|---|
| Stable product UUID | Product Catalogue / `products` | All | Layout, Content body |
| Product code (e.g. C-01) | `products.product_code` | Content, A4 footer via release | Layout JSON |
| Canonical product name | `products.canonical_name` | Content presentation | BOM, Theme |
| Product kind | `product_kinds` + `products.product_kind_code` (ADR-005) | — | Content; commercial_role alone |
| Commercial role | `commercial_roles` + `products.commercial_role` | Unlock rules | Treating BONUS as a product_kind or product row |
| Hierarchy Foundation→Collection→Experience→Add-on (+ Standalone peer) | ADR-001 + kind codes | Relationships | Page layout |
| Protection Bonus | `pos2_included_benefits` + unlock relationship (C-01∧C-06∧E-05) | Configurator / CCTV page | Separate Product ID / page / price |
| Legacy product codes | `pos2_product_aliases` | Importer | Silent rewrite of historical snapshots |
| Add-on parent eligibility | `addon_parent_eligibility` | Configurator, Proposal | Content, Layout |
| Add-on extends capability | `addon_profiles.extends_capability_id` | Validation | Customer copy |
| Featured Add-ons order | `product_featured_addons` | A4/Website placements | Eligibility table (different concern) |
| Public Product OS version stamp | `releases.release_code` = V2.07 | Footer | Document template version alone |
| A4 / document template version | `document_template_versions` | Footer composition | Overwriting Product OS release |

---

## 2. Customer Language

| Fact | Owner | May reference | Forbidden |
|---|---|---|---|
| Hero | `content_entries` + placement; migrate approved A4 (DEC-012); V2.07 `14` incomplete | A4/Website | `products` / Master Hero as authority |
| Subtitle | content library | — | product price field; Master Subtitle as authority |
| Story title / body | content library; A4 verbatim (DEC-012); DEC-002/003 corrections only when PO-linked regen | — | BOM; Legacy sheet 12 |
| Problem / Better Home Response | content library | optional fact_reference | technical automation as sole source |
| Front Moments | content library (`moment`) sequenced on `front` | Layout for display limit only | inventing moments in layout; auto-approving Legacy 12 |
| Customer Experience presentation | `experience_presentation_mappings` + content | canonical `product_experiences` + optional automation ID | creating capability/automation from label (DEC-009) |
| Expand Further labels | content referencing relationships; “Add-ons” = presentation_cta | relationship rows | creating products from CTA (DEC-010) |
| Experience Promise (Add-on) | content library key linked from `addon_profiles` | Add-on product | eligibility |
| Footer copy | content library / `footer_configs` | Product OS release + separate template version | Merging release into template identity |
| Installation-assumption customer wording | content / assumptions layer=CUSTOMER | — | Zigbee/protocol jargon (ISSUE-020) |

---

## 3. Product Language

| Fact | Owner | May reference | Forbidden |
|---|---|---|---|
| Coverage | `products.coverage` | Proposal | Theme |
| Canonical experiences | `product_experiences` | Presentation mappings | A4 regrouping as sole identity |
| Included scope structure | `scope_groups` / `scope_items` | A4 scope section | Customer story body as source |
| Kitchen warm strip | Capability `Warm Kickboard Ambient Zone` + BOM (DEC-002) | Scope presentation | WORKTOP implying included strip under worktop |
| Bathroom circuits | Capability notes: up to six compatible circuits (DEC-003) | Scope copy | “lighting-only” wording |
| Entry door awareness | Door-contact capability + BOM qty 1 (DEC-001 planned) | Door Awareness experience | Claim without capability |
| Standard scope unit / qty | `scope_items` | — | BOM qty as silent substitute without capability link |
| Installation assumptions | `installation_assumptions` (CUSTOMER vs TECHNICAL layers) | Proposal/A4 | Technician wiring detail in customer layer |
| Dependencies / Expand Further graph | `product_relationships` (+ requirements); A4 lists initial source (DEC-010) | Content labels | Product name strings as FKs |
| Customer price amount | `product_prices.amount` | Proposal, A4, Website | Display sentence inside amount |
| GST / tax basis | `product_prices.tax_basis_code` | — | Theme |
| Exact / From / Contact | `price_display_modes` via price row | — | Layout |
| Installed / Supply only | `price_fulfilment_modes` via price row | — | Inheriting installed incl GST when SUPPLY_ONLY |
| E-06 commercial exceptions (Smart Toilet) | per price record (DEC-011 / DEC-013) | Proposal | Collection default inheritance |
| Price effective dates / version | `product_prices` | Releases | Single field on product |

---

## 4. Technical Language

| Fact | Owner | May reference | Forbidden |
|---|---|---|---|
| SKU code / brand / supplier | `equipment_skus` | BOM items | Customer hero |
| Unit cost ex GST | `equipment_skus` | Costing views | Customer channels |
| BOM qty / included type | `bom_items` under `bom_versions` | Capability support links | Content, Layout |
| Labour hours | `labour_library` + `labour_items` | Costing | A4 customer copy |
| Protocol | `equipment_skus` / technical notes | ServiceM8 | Website marketing |
| Automation trigger / condition / action | `automation_*` | Product attach | Content narrative as sole source |
| Return Routine (C-06) | Automation definition with DEC-004 boundaries | Experience presentation map | Auto garage open; unpurchased rooms |
| Technician instructions | SKU / technical notes fields | Work orders | Proposal customer story |

---

## 5. Capabilities and scope linkage

| Fact | Owner | Rule |
|---|---|---|
| Capability catalogue | `capabilities` | Not hardware, not brand |
| Product includes capability | `product_capability_inclusions` | |
| Scope item → capability | `scope_items.capability_id` **required** | A4 scope item must link capability |
| Capability support evidence | `capability_support_links` | BOM, rule, or non-hardware |

---

## 6. Presentation (Assets / Layout / Theme)

| Fact | Owner | May reference | Forbidden |
|---|---|---|---|
| Image URI / rights / asset version | `image_assets` with `publish_status`; placeholders `NOT_APPROVED_FOR_PUBLISH` (DEC-007) | product_image_links | Product price; silent fallback to placeholder |
| Crop / focal point | `image_crops` | surface-specific | Canonical name |
| Theme tokens / product accents | `themes` / `theme_tokens` (from Theme Library) | Website, Configurator | Per-product price |
| Channel theme override (A4 green) | channel theme (ADR-007 / DEC-006) | A4 surface | Overwriting canonical product accents |
| Layout geometry | `layout_templates` / `layout_configs` | experience presentation map + relationships | Layout sheet as sole authority vs approved A4 |
| Document template version | `document_template_versions` | Footer | Overwriting Product OS release |

**Invariant:** A page may reference approved content; it must not own canonical product facts.

---

## 7. Governance and provenance

| Fact | Owner | Consumers |
|---|---|---|
| Release composition | `releases` + `release_components` | Publish gates, A4 footer version |
| Validation outcomes | `validation_results` | Release approval |
| Source conflicts | `migration_issues` | Product Owner decisions |
| Import batch + hash | `import_batches` | Audit |
| Row provenance | `source_provenance` | Reconciliation |
| Mutation audit | `audit_log` | Compliance |

---

## 8. Language separation cheat-sheet

```
Customer Language  →  content_entries / placements
Product Language   →  products, scope_*, relationships, prices, assumptions, eligibility
Technical Language →  equipment_skus, bom_*, labour_*, automation_*, technical notes
Presentation       →  image_*, theme_*, layout_*, footer_configs
Governance         →  releases, validation_results, migration_issues, import_batches
```

If a field could sit in two places, prefer the **higher-authority Product or Technical
Language table**, and let Customer Language / Presentation **reference** it.

---

## 9. V1 / workbook Legacy ownership (excluded from new runtime)

| Location | Treatment in V2 |
|---|---|
| `product_catalog.hero/subtitle/story` | Migrate into content library; do not keep as Product Language |
| `product_catalog.final_installed_price` | Migrate into versioned `product_prices` |
| `product_content` | Map to content_entries + placements; Legacy archive if needed |
| `product_theme` / `product_layout` | Map to shared theme/layout; leave V1 as Legacy |
| `EXPERIENCE_PACK` enum | Legacy compatibility only (ADR-001) |
| `definitions/*.json` placeholders | Pipeline/regression only (ADR-002); never override V2.07 |
| Workbook `12_Product_Card_Content` | **Legacy only** — inventory Legacy-only strings (ISSUE-017); no runtime reads |
| Workbook `14_Content_Library` | Incomplete baseline; DEC-012 migrates approved A4 copy into content_entries |
| Product Master Hero/Subtitle/Accent/Price columns | Non-authoritative duplicates of Content/Theme/Pricing |

---

## 10. Phase 2A ownership reminders

| Topic | Owner | Not owner |
|---|---|---|
| Numeric Collection price | `10_Pricing_Summary` → `product_prices` | Placeholder JSON; Master price column |
| Away price $1,499 | V2.07 Pricing (ISSUE-023 NOT_A_CONFLICT) | Older $2499 placeholders |
| Door Awareness | Planned door-contact capability + BOM (DEC-001) | A4 claim alone |
| Warm strip placement | `Warm Kickboard Ambient Zone` (DEC-002) | A4 WORKTOP group alone |
| Bathroom circuits | Compatible-circuit qualifier (DEC-003) | Lighting-only A4 wording |
| Return Routine | Planned automation (DEC-004) | Presentation label alone |
| Expand Further graph | Typed relationships from A4 lists (DEC-010) | Layout “compatible packs” flag alone |
| Product OS vs A4 template version | Separate fields (DEC-005) | Single Version column |
