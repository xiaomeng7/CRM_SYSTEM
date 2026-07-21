# Product OS V2 — Target Data Model

- Phase: 1 design + **Phase 2A** Product Owner decision incorporation
- Date: 2026-07-18
- Status: Logical model updated for DEC-001…012; **no Prisma/SQL/migration yet**
- ADRs: ADR-001…004; **ADR-005** (dual-axis kind×role); **ADR-006** (release vs template);
  **ADR-007** (theme hierarchy)

### Source reconciliation status
Approved immutable sources verified under `docs/product-os/source/` (Phase 2).
Phase 2A records PO decisions and **planned import deltas** without editing snapshots.
Unresolved publish dependency: approved Collection hero originals (ISSUE-007 / SRC-05).

### Naming conventions
- V2 tables are designed as the **runtime Product Language** store.
- Recommended physical prefix when implemented: `pos2_` (or schema `product_os_v2`)
  so V1 Legacy tables remain untouched. Final prefix is an open implementation
  decision (see `open-decisions.md`).
- All entities use stable UUID primary keys unless a controlled lookup uses a short
  stable code as PK (documented per table).
- Relationships use IDs, never product-name strings.
- Soft archive via `status` / `archived_at`; no hard delete of approved product facts
  in normal operations.

### Three languages (mandatory separation)
| Language | Owns | Must not own |
|---|---|---|
| **Customer Language** | Hero, Subtitle, Story, Problem, Response, Moments, customer Experience presentation copy, Expand Further presentation labels, Add-on Experience Promise copy, page-facing footer copy | BOM qty, SKU, costs, eligibility, automation logic, installed price facts |
| **Product Language** | Canonical name, type, coverage, included scope structure, Add-on name, parent eligibility, standard scope unit, customer price facts, installation assumptions, dependencies | Page layout geometry, crop pixels, raw technician wiring notes |
| **Technical Language** | SKU, BOM, labour, protocol, trigger/condition/action, technical notes, technician instructions | Customer marketing narrative |

---

# Bounded Context A — Product Catalogue

## A1. `product_kinds` (lookup) — ADR-005 / DEC-008
- **Purpose:** Canonical structural product identity (not commercial role).
- **PK:** `code` TEXT
- **Codes:** `FOUNDATION` \| `COLLECTION` \| `EXPERIENCE` \| `ADDON` \| `STANDALONE`
- **Fields:** `code`, `label`, `description`, `hierarchy_rank`, `is_active`
- **Legacy map (source → kind):** Experience Pack → `EXPERIENCE`; Infrastructure → typically
  `FOUNDATION` for F-01; Standalone Product → `STANDALONE`
- **Must not store:** Bonus / Product Pack as kinds (`Bonus` is a commercial role;
  `Product Pack` maps via commercial role `PACK`)

## A1b. `commercial_roles` (lookup) — ADR-005 / DEC-008 (amended DEC-013)
- **Purpose:** Commercial / access role orthogonal to product kind.
- **PK:** `code` TEXT
- **Codes used on products:** `STANDARD` \| `PACK`
- **Fields:** `code`, `label`, `allows_independent_purchase`, `requires_unlock`, `is_active`
- **Rules (DEC-013):** Protection Bonus is **not** a product with `commercial_role=BONUS`.
  It is an included benefit hosted on CCTV. Product CHECK forbids EXPERIENCE+BONUS.

## A1c. Initial classification (DEC-013 / ADR-012, authoritative)
| product_code | product_kind | commercial_role |
|---|---|---|
| F-01 | FOUNDATION | STANDARD |
| C-01…C-06 | COLLECTION | STANDARD |
| Ordinary Enhancements (e.g. E-01…E-04) | EXPERIENCE | STANDARD |
| **E-05 CCTV** | EXPERIENCE | PACK |
| **E-06 Smart Toilet** | STANDALONE | STANDARD |
| AO-* equipment extensions | ADDON | STANDARD |

**No canonical E-07. No Protection product row.**  
**Protection unlock:** C-01 ∧ C-06 ∧ **E-05 (CCTV)** → included benefit on CCTV (see B6 / `legacy-id-crosswalk.md`).

## A1d. Legacy aliases & included benefits (DEC-013)
- **`pos2_product_aliases`:** Legacy / external codes → `PRODUCT` | `INCLUDED_BENEFIT` | `WITHDRAWN`
- **`pos2_included_benefits`:** Non-product benefits (e.g. `benefit.protection_bonus`) hosted on a product
- Historical Legacy codes preserved; never silently rewritten in source snapshots

## A2. `product_statuses` (lookup)
- **Purpose:** Lifecycle of product catalogue rows.
- **PK:** `code` (`DRAFT` \| `ACTIVE` \| `FROZEN` \| `ARCHIVED` …)
- **Fields:** `code`, `label`, `allows_sale`, `allows_publish`
- **Must not store:** content approval status (that belongs to content versions)

## A3. `products`
- **Purpose:** Stable product identity (canonical catalogue node).
- **PK:** `id` UUID
- **Important fields:**
  - `product_code` TEXT — external stable business ID (F-01, C-01…C-06, E-01…E-06; Add-ons AO-*; **no E-07**)
  - `canonical_name` TEXT
  - `product_kind_code` → `product_kinds.code` (**required**)
  - `commercial_role_code` → `commercial_roles.code` (**required**, default `STANDARD`)
  - `status_code` → `product_statuses.code`
  - `parent_product_id` UUID NULL → `products.id` (optional hierarchy hint; Add-on eligibility is separate)
  - `coverage` TEXT NULL (Product Language)
  - `requires_foundation` BOOLEAN (derived convenience; authoritative dependency also in relationships)
  - `notes` TEXT NULL (internal)
  - `created_at`, `updated_at`, `archived_at`
- **Uniqueness:** unique(`product_code`); unique(`canonical_name`, `product_kind_code`) with care for rename history via versions
- **Source of truth:** V2.07 Product facts + Phase 2A DEC-* / planned deltas
- **Consumers:** Configurator, Proposal, Contract, Website, A4, ServiceM8, APIs
- **Must not store:** hero/story copy; BOM; prices; layout; theme; image URLs as facts
- **Deprecated field:** `product_type_code` / single-axis `product_types` (replaced by kind × role)

## A4. `product_versions`
- **Purpose:** Versioned Product Language snapshot metadata for a product.
- **PK:** `id` UUID
- **Fields:** `product_id`, `version_label` (e.g. `2.07`), `status`, `effective_from`,
  `effective_to`, `supersedes_version_id`, `change_summary`, timestamps
- **Uniqueness:** unique(`product_id`, `version_label`)
- **Must not store:** full denormalized product blob; link to BOM/price/content versions via release composition

## A5. `addons` (subtype / role view of products)
Design option (recommended): Add-ons **are** `products` with `product_kind_code = ADDON`
and typically `commercial_role_code = STANDARD`.
Optional thin table `addon_profiles`:
- **PK:** `product_id` → `products.id`
- **Fields:** `experience_promise_key` (content reference only), `extends_capability_id` → `capabilities.id` (required), `creates_new_room` BOOLEAN DEFAULT FALSE CHECK FALSE, `creates_new_experience` BOOLEAN DEFAULT FALSE CHECK FALSE
- **Must not store:** parent list (use eligibility table); price (pricing context)

## A6. `addon_parent_eligibility`
- **Purpose:** Which parent products may host which Add-on.
- **PK:** `id` UUID
- **Fields:** `addon_product_id` → `products.id`, `parent_product_id` → `products.id`,
  `status`, `notes`, timestamps
- **Uniqueness:** unique(`addon_product_id`, `parent_product_id`)
- **Rules:** Add-on may only extend a capability already present on the parent
  (enforced via validation + optional FK path through capability inclusion).
- **Must not store:** marketing promise text

## A7. `product_featured_addons`
- **Purpose:** Ordered featured Add-ons for a parent product presentation.
- **PK:** `id` UUID
- **Fields:** `parent_product_id`, `addon_product_id`, `sequence`, `status`, surface optional
- **Uniqueness:** unique(`parent_product_id`, `addon_product_id`, `surface_code` nullable coalesced)
- **Must not store:** Add-on copy; eligibility (must exist in eligibility table)

## A8. `installation_assumptions`
- **Purpose:** Product Language installation boundary statements (customer-safe).
- **PK:** `id` UUID
- **Fields:** `product_id`, `sequence`, `assumption_text`, `layer` (`CUSTOMER` \| `TECHNICAL`),
  `status`, `version_label` optional, timestamps
- **Must not store:** protocol jargon in `CUSTOMER` layer (Zigbee → TECHNICAL; ISSUE-020 / DEC-012 layering)
- **Planned C-01 (DEC-001):** customer + technical assumptions for door-contact mounting and Zigbee connectivity

---

# Bounded Context B — Capability and Relationships

## B1. `capabilities`
- **Purpose:** Canonical capability catalogue (not hardware, not brand).
- **PK:** `id` UUID
- **Fields:** `capability_code`, `name`, `description`, `status`
- **Uniqueness:** unique(`capability_code`)
- **Must not store:** customer narrative; SKU brand
- **Planned names (DEC-002):** Kitchen ambient strip capability = `Warm Kickboard Ambient Zone`
- **Planned C-01 (DEC-001):** door open/closed (door-contact) capability for main entry

## B2. `product_capability_inclusions`
- **Purpose:** Which capabilities a product includes, with qty/unit.
- **PK:** `id` UUID
- **Fields:** `product_id`, `capability_id`, `included_qty`, `unit_code`, `customer_layer` optional, `notes`, `status`
- **Uniqueness:** unique(`product_id`, `capability_id`)
- **Must not store:** BOM line items (link via support evidence if needed)
- **Planned C-01:** include door-contact capability qty 1
- **C-05 (DEC-003):** six-circuit switch notes must allow lighting / exhaust fan / heat lamp /
  compatible bathroom heating — not lighting-only

## B3. `capability_support_links` (optional but recommended)
- **Purpose:** Evidence that a capability is supported by BOM / rule / non-hardware declaration.
- **PK:** `id` UUID
- **Fields:** `product_capability_inclusion_id`, `support_kind` (`BOM_ITEM` \| `RULE` \| `NON_HARDWARE`), `bom_item_id` NULL, `rule_id` NULL, `notes`
- **Must not store:** customer scope wording

## B4. `relationship_types` (lookup) — DEC-010
- **PK:** `code`
- **Canonical codes:**
  - `compatible_experience`
  - `recommended_next_product`
  - `prerequisite`
  - `bonus_prerequisite`
  - `bonus_unlock`
  - `presentation_cta` (not a product fact; Expand Further “Add-ons” uses this)
- Optional retained: `mutually_exclusive`
- **Must not:** treat presentation CTA as inventing a product

## B5. `product_relationships`
- **Purpose:** Directed product↔product relationships using stable IDs.
- **PK:** `id` UUID
- **Fields:** `from_product_id`, `to_product_id` NULL (NULL allowed only for `presentation_cta`),
  `relationship_type_code`, `status`, `priority`, `notes`, timestamps
- **Uniqueness:** unique(`from_product_id`, `to_product_id`, `relationship_type_code`) with NULL handling for CTAs
- **Initial source (DEC-010):** approved A4 Expand Further lists; validate every product target exists before import
- **Must not store:** display copy for Expand Further (Customer Language may reference relationship ID)

## B6. `relationship_requirements`
- **Purpose:** Multi-product requirements for relationships such as `bonus_unlock`.
- **PK:** `id` UUID
- **Fields:** `relationship_id` → `product_relationships.id`, `required_product_id`,
  `requirement_group`, `min_qty` DEFAULT 1, `logic` (`AND` within group)
- **Authoritative Protection Bonus (DEC-013 / ADR-012):**
  required products **C-01**, **C-06**, **E-05 (CCTV)** unlock included benefit
  `benefit.protection_bonus` on CCTV — **no Protection product row**
- **Must not store:** page-specific labels

## B7. `product_experiences` — DEC-009
- **Purpose:** Canonical Experience Library records (Product Language).
- **PK:** `id` UUID
- **Fields:** `experience_code` (stable), `product_id`, `canonical_title`, `canonical_description`,
  `sequence`, `status`, `linked_capability_id` NULL, `linked_automation_id` NULL
- **Uniqueness:** unique(`experience_code`); unique(`product_id`, `sequence`) recommended
- **Must not store:** channel-specific A4 regrouping titles (use B8)

## B8. `experience_presentation_mappings` — DEC-009
- **Purpose:** Channel presentation of canonical experiences (Customer/Presentation).
- **PK:** `id` UUID
- **Fields:**
  - `experience_id` → `product_experiences.id` (**required**)
  - `channel` / `surface_code` / `side_code`
  - `display_title`, `customer_description`
  - `sort_order`, `grouping`, `visibility`
  - `linked_automation_id` NULL (optional override reference; must exist if set)
  - `status`, timestamps
- **Rule:** A presentation label must **not** create an unsupported capability or automation.
- **Layout authority (ISSUE-018):** approved A4 presentation mapping overrides Layout sheet drift.

---

# Bounded Context C — Scope and BOM

## C1. `scope_groups`
- **Purpose:** Group standard scope for Product Language / A4 scope sections.
- **PK:** `id` UUID
- **Fields:** `product_id`, `group_code`, `title` (Product Language short label), `sequence`, `status`
- **Must not store:** long customer story copy

## C2. `scope_items`
- **Purpose:** Atomic included-scope statements linked to capabilities.
- **PK:** `id` UUID
- **Fields:** `scope_group_id`, `capability_id` (required), `sequence`,
  `standard_scope_unit`, `qty`, `label` (Product Language), `status`
- **Uniqueness:** unique(`scope_group_id`, `sequence`); recommend unique capability
  per group where appropriate
- **Must not store:** BOM quantities as substitute for scope; customer marketing fluff

## C3. `equipment_skus` (SKU catalogue)
- **Purpose:** Technical Language procurement identity.
- **PK:** `id` UUID
- **Fields:** `sku_code` (preserve Excel SKU verbatim), `name`, `category`, `brand`,
  `supplier`, `unit_cost_ex_gst`, `currency_code`, `protocol`, `technical_notes`,
  `technician_instructions`, `status`, timestamps
- **Uniqueness:** unique(`sku_code`)
- **Must not store:** customer hero/story; product price

## C4. `bom_versions`
- **Purpose:** Version BOM independently from customer content.
- **PK:** `id` UUID
- **Fields:** `product_id`, `version_label`, `status`, `effective_from`, `effective_to`, timestamps
- **Uniqueness:** unique(`product_id`, `version_label`)

## C5. `bom_items`
- **Purpose:** Lines in a BOM version.
- **PK:** `id` UUID
- **Fields:** `bom_version_id`, `sku_id`, `qty`, `included_type` (`STANDARD` \| `OPTIONAL` \| `UPGRADE`), `notes`, `sequence`
- **Uniqueness:** unique(`bom_version_id`, `sku_id`)
- **Must not store:** customer price; layout
- **Planned C-01 (DEC-001):** add approved Zigbee door-contact SKU quantity **1** (workbook not edited in Phase 2A)

## C6. `labour_library`
- **Purpose:** Canonical labour items with hours.
- **PK:** `id` UUID
- **Fields:** `labour_code` / `labour_item`, `hours`, `category`, `notes`, `status`
- **Uniqueness:** unique labour identifier

## C7. `labour_versions` + `labour_items`
- Analogous to BOM versioning for labour attach to product.
- **Must not store:** loaded labour rate (settings / price books)

---

# Bounded Context D — Rules and Automation

## D1. `rule_definitions`
- **Purpose:** Reusable / product-attached Product Language or validation rules.
- **PK:** `id` UUID
- **Fields:** `rule_code`, `product_id` NULL (null = global), `rule_key`, `rule_value`,
  `severity`, `status`, `notes`
- **Uniqueness:** unique(`product_id`, `rule_key`) with nulls treated carefully
- **Must not store:** automation trigger graph

## D2. `validation_rules`
- **Purpose:** Machine-checkable constraints for release gates (identity, content,
  scope, add-on, pricing, relationships).
- **PK:** `id` UUID
- **Fields:** `rule_code`, `category`, `expression_or_checker_key`, `severity` (`P0`…), `status`
- **Must not store:** per-run results (see Governance)

## D3. `automation_definitions`
- **Purpose:** Canonical automation library (Technical Language).
- **PK:** `id` UUID
- **Fields:** `automation_code`, `name`, `description`, `status`, `product_id` NULL
  (library item may be linked to products via join), `trigger_type`, `boundary_notes`
- **Uniqueness:** unique(`automation_code`)
- **Must not store:** A4 customer copy of routine names as sole identity
- **Planned C-06 (DEC-004):** `Return Routine` — restore Away → normal state of already
  purchased/configured Collections; may exit Away mode / restore Collection behaviour /
  restore appropriate lighting or comfort; must not create new room control; must not
  control unpurchased capabilities; must not automatically open garage. Stable ID assigned
  at migration/import.

## D4. `product_automations`
- **Purpose:** Attach automation definitions to products with sequence.
- **PK:** `id` UUID
- **Fields:** `product_id`, `automation_id`, `sequence`, `status`

## D5. `automation_conditions`
- **Purpose:** Structured conditions for an automation definition.
- **PK:** `id` UUID
- **Fields:** `automation_id`, `sequence`, `condition_type`, `expression`, `notes`

## D6. `automation_actions`
- **Purpose:** Structured actions for an automation definition.
- **PK:** `id` UUID
- **Fields:** `automation_id`, `sequence`, `action_type`, `expression`, `notes`

## D7. Trigger representation
- Prefer `automation_definitions.trigger_type` + optional `automation_triggers` rows
  if multiple triggers required. Return Routine boundaries recorded in DEC-004 / D3.

---

# Bounded Context E — Pricing

## E1. `price_books`
- **Purpose:** Named price book (e.g. AU retail installed 2026).
- **PK:** `id` UUID
- **Fields:** `code`, `name`, `currency_code`, `status`, `effective_from`, `effective_to`

## E2. `tax_bases` (lookup) — DEC-011
- **PK:** `code` — e.g. `GST_INCLUSIVE`, `GST_EXCLUSIVE`, `GST_FREE`
- Default Collections: GST inclusive on customer price amount

## E3. `price_display_modes` (lookup)
- **PK:** `code` — `EXACT` \| `FROM` \| `CONTACT`
- Display wording is **not** stored inside `amount`

## E4. `price_fulfilment_modes` (lookup) — DEC-011
- **PK:** `code` — `INSTALLED` \| `SUPPLY_ONLY`
- Default Collections: `INSTALLED`
- No product may inherit installed incl-GST presentation when fulfilment is `SUPPLY_ONLY`

## E5. `product_prices`
- **Purpose:** Versioned customer-facing price facts (Product Language).
- **PK:** `id` UUID
- **Fields:**
  - `price_book_id`
  - `product_id`
  - `amount` DECIMAL NULL (null allowed for CONTACT; included benefits have no separate customer price)
  - `currency_code`
  - `tax_basis_code`
  - `display_mode_code`
  - `fulfilment_mode_code`
  - `scope_basis` TEXT/enum — e.g. `DEFINED_STANDARD_SCOPE`
  - `subject_to_installation_assumptions` BOOLEAN
  - `commercial_notes` / exception flags JSONB (freight excluded, plumber excluded, etc.)
  - `version_label`
  - `status`
  - `effective_from`, `effective_to`
  - timestamps
- **Uniqueness:** unique(`price_book_id`, `product_id`, `version_label`, `fulfilment_mode_code`)
- **Must not store:** material/labour cost; customer story; display sentence baked into amount
- **E-06 Smart Toilet exception (DEC-011 / renumbered DEC-013):** independently purchasable; supply-only unless
  separately quoted; plumber installation excluded; freight excluded (customer-paid);
  optional electrical supply work quoted separately; GST follows this price record

## E6. `addon_prices`
- Same shape as `product_prices` constrained to Add-on product kinds, or unify in
  `product_prices` with kind check. Recommended: **unify** in `product_prices`.

## E7. `costing_settings`
- Loaded labour rate, company overhead, etc. (system parameters with effective dating).
- **Must not store:** customer installed price.

**Rule:** Pricing is never a single mutable field on `products`.
**Rule (DEC-011):** Collection default = installed + GST inclusive + defined standard scope +
subject to recorded installation assumptions — as structured qualifiers, not display text in amount.

---

# Bounded Context F — Customer Content

## F1. `content_surfaces` (lookup)
- Codes: `a4`, `website`, `proposal`, `print`, `ai`, `contract`, …

## F2. `content_locales` (lookup)
- e.g. `en-AU`

## F3. `content_types` (lookup) — DEC-012
- Required for six-Collection A4 migration: `hero`, `subtitle`, `story_title`, `story_body`,
  `problem`, `response`, `moment`, `customer_experience`, `installation_assumption_customer`,
  `footer`, `experience_promise`, …

## F4. `content_sides` (lookup)
- `front`, `back`, `na`

## F5. `content_entries`
- **Purpose:** Approved Customer Language units.
- **PK:** `id` UUID
- **Fields:** `content_key`, `content_type_code`, `title`, `body`, `locale_code`,
  `status` (`DRAFT` \| `APPROVED` \| `FROZEN` \| `ARCHIVED`), `version_label`,
  `fact_reference_kind` / `fact_reference_id` (optional link to capability/relationship/experience),
  `source_provenance`, timestamps
- **Uniqueness:** unique(`content_key`, `locale_code`, `version_label`) or similar
- **Must not store:** BOM, price amounts, eligibility
- **Migration (DEC-012):** migrate approved six-Collection A4 copy **verbatim**; may reference
  facts but must not redefine them; apply DEC-002/003 corrections only when PO-linked regen requires

## F6. `product_content_placements`
- **Purpose:** Bind content entries to products for a surface/side/sequence.
- **PK:** `id` UUID
- **Fields:** `product_id`, `content_entry_id`, `surface_code`, `side_code`,
  `sequence`, `status`
- **Uniqueness:** unique(`product_id`, `surface_code`, `side_code`, `content_entry_id`, `sequence`)
- **Must not store:** layout grid coordinates (Assets/Presentation)

## F7. Legacy content archive
- `legacy_product_card_content` — archive of `12_Product_Card_Content` style rows.
- **Purpose:** migration reference only; **no new system may read** for runtime.
- Marked Legacy; excluded from V2 read model.
- Legacy-only text must **not** become approved automatically (DEC-012).

## F8. Content library semantics
- `14_Content_Library` maps to `content_entries` + placements (incomplete vs A4 today).
- Approved A4 text (DEC-012) is Customer Content authority for the six Collections.
- Preserve exact approved wording unless a linked PO decision requires correction.

---

# Bounded Context G — Assets and Presentation

## G1. `image_assets`
- **Purpose:** Shared media catalogue.
- **PK:** `id` UUID
- **Fields:** `asset_code`, `storage_uri`, `alt_text_default`, `rights_notes`,
  `publish_status` (`APPROVED` \| `NOT_APPROVED_FOR_PUBLISH` \| `ARCHIVED`),
  `version_label`, timestamps
- **DEC-007:** Generic Image Library paths are placeholders → `NOT_APPROVED_FOR_PUBLISH`.
  No customer-facing generator may silently fall back to a placeholder.
  Approved Collection heroes must be registered as versioned assets when originals exist.
- **Must not store:** product price; BOM

## G2. `image_crops` / focal points
- **PK:** `id` UUID
- **Fields:** `asset_id`, `surface_code`, `focal_x`, `focal_y`, `crop_box` JSONB,
  `version_label`, `status`
- JSONB allowed for crop geometry only.

## G3. `product_image_links`
- Bind asset (+ optional crop) to product for surface/sequence.
- Link must reference `APPROVED` assets for publishable surfaces.

## G4. `themes` — ADR-007 / DEC-006
- Shared theme entities (global brand, channel, optional product accent themes).
- **Fields:** `theme_code`, `name`, `theme_scope` (`GLOBAL` \| `CHANNEL` \| `PRODUCT`),
  `channel_code` NULL, `product_id` NULL, `status`

## G5. `theme_tokens`
- **Fields:** `theme_id`, `token_key`, `token_value`, `status`
- Resolution hierarchy: global brand → channel theme → optional product accent → asset/crop.
- A4 channel theme = unified Better Home green; must **not** overwrite product accent rows.

## G6. `layout_templates`
- Shared templates per surface.

## G7. `layout_configs`
- **Fields:** `template_id`, `product_id` NULL, `surface_code`, `definition` JSONB,
  `status`, `version_label`
- **Must not store:** canonical product facts inside layout JSON (IDs/references only).
- **Authority:** derive A4 section counts/visibility from experience presentation mappings
  + relationships (ISSUE-018 RESOLVED), not Layout sheet alone.

## G8. `footer_configs`
- Footer composition referencing content entries + **Product OS release** label (V2.07)
  and separately **document_template_version** (e.g. A4 Review Set V1) — ADR-006 / DEC-005.

## G9. `document_template_versions`
- **Fields:** `template_code`, `version_label`, `surface_code`, `notes`, `status`
- Distinct from Product OS `releases.release_code`.

**Rule:** Page layout records reference approved content and product IDs; they never
own canonical product facts.

---

# Bounded Context H — Governance and Releases

## H1. `releases`
- **Purpose:** Approved combination of product facts, BOM, rules, pricing, content
  versions for a publishable Product OS cut.
- **PK:** `id` UUID
- **Fields:** `release_code` (canonical Product OS = **`V2.07`** / `POS-2.07`), `label`,
  `status`, `released_at`, `notes`
- **Must not conflate** with A4 document template version (G9 / ADR-006)

## H2. `release_components`
- **Fields:** `release_id`, `component_kind` (`PRODUCT_VERSION` \| `BOM_VERSION` \|
  `PRICE` \| `CONTENT_ENTRY` \| `AUTOMATION` \| `THEME` \| `LAYOUT` …),
  `component_id` UUID, `product_id` NULL
- A release identifies the approved combination explicitly.

## H3. `validation_results`
- Persist Phase 7 style checks: `release_id` / `import_batch_id`, `rule_code`,
  `severity`, `passed`, `message`, `payload` JSONB, timestamps

## H4. `migration_issues`
- Conflict register fields required by brief:
  `issue_id`, `affected_product_id`, `category`, `description`, `source_a`,
  `source_b`, `exact_value_a`, `exact_value_b`, `affected_downstream_systems`,
  `severity`, `status`, `recommended_resolution`, `decision`, `decided_by`,
  `decided_at`

## H5. `audit_log`
- Generic append-only audit: actor, action, entity_type, entity_id, before/after
  JSONB, timestamp

---

# Bounded Context I — Import and Validation

## I1. `import_batches`
- **Fields:** `id`, `source_filename`, `source_sha256`, `source_kind` (`V2_07_XLSX`…),
  `started_at`, `finished_at`, `mode` (`DRY_RUN` \| `APPLY`), `status`, `stats` JSONB

## I2. `source_provenance`
- Link rows to `import_batch_id` + sheet name + row number for auditability.

## I3. `sheet_mappings` (config, may be code-owned initially)
- Documents Excel sheet → V2 table mapping for Phase 4 importer.
- `[NEEDS V2.07 RECONCILIATION]` for exact sheet names

---

# Cross-cutting fields (all mutable business tables)
Where applicable: `status`, `created_at`, `updated_at`, `created_by`, `updated_by`,
`import_batch_id` NULL, `source_row_ref` NULL.

---

# V1 Legacy boundary
V1 tables (`product_catalog`, `sku_library`, …) remain operational Legacy.
- Marked Legacy in docs and tooling.
- Excluded from new V2 runtime design and new consumer contracts.
- No destructive drop/rename in this programme.

---

# Downstream consumer matrix (summary)
| Consumer | Primary contexts |
|---|---|
| A4 Product Sheet | F Content, G Presentation, A Product, B Relationships, E Pricing |
| Website | F, G, A, B, E |
| Configurator | A, B, E, D Rules, Add-on eligibility |
| Proposal / Quote | A, E, C Scope, B, F |
| Contract | A, E, B eligibility, F approved clauses |
| ServiceM8 Work Order | C BOM/Labour, D Automation, Technical notes |
| Installation / Technician | C, D, installation_assumptions, technical notes |
| Future APIs | V2 Read Model over A–I |

---

# Design invariants (must hold in Phase 3+)
1. Product facts not stored inside page-layout records.
2. Customer copy must not redefine BOM, pricing, eligibility, or technical facts.
3. A page may reference approved content but must not own canonical product facts.
4. Add-ons only extend a capability already present on the selected parent.
5. Add-ons must not create a new room, Collection, or Experience.
6. Canonical Add-on presentation: **Product name + Experience Promise**.
7. Pricing versioned; not a single mutable field on Product; display wording not in amount.
8. BOM versioned independently from customer content.
9. Relationships use stable IDs; presentation CTAs are not product facts.
10. A Release identifies approved combination of facts/BOM/rules/pricing/content.
11. Legacy tables clearly marked and excluded from new runtime design.
12. Do not infer missing Better Home product facts.
13. Dual-axis identity: every product has `product_kind` × `commercial_role` (ADR-005).
14. Protection is an included benefit (not a product); not independently purchasable; no separate customer price.
15. Product OS release and document template version are separate (ADR-006).
16. Theme resolution respects channel override without mutating product accents (ADR-007).
17. Placeholders marked `NOT_APPROVED_FOR_PUBLISH` must not silently publish (DEC-007).

---

# Phase 2A approved future import deltas (workbook immutable)

| Delta ID | Authority | Change (apply at import / migration — not Phase 2A) |
|---|---|---|
| DELTA-C01-DOOR | DEC-001 | C-01: door-contact capability + Zigbee door-contact SKU qty 1 + Door Awareness link + install assumptions |
| DELTA-C03-KICK | DEC-002 | C-03: capability `Warm Kickboard Ambient Zone`; scope/content so WORKTOP ≠ included strip |
| DELTA-C05-CIRCUIT | DEC-003 | C-05: compatible-circuit wording (lighting/fan/heat lamp/heating) |
| DELTA-C06-RETURN | DEC-004 | C-06: Return Routine automation with boundaries |
| DELTA-PROTECTION-BENEFIT | DEC-013 | Protection = included benefit on E-05 CCTV; unlock C-01∧C-06∧E-05; no product ID |
| DELTA-RENUMBER-E | DEC-013 | Legacy E-06→E-05 CCTV; Legacy E-07→E-06 Toilet; no canonical E-07 |
| DELTA-CONTENT-A4 | DEC-012 | Verbatim six-Collection A4 customer copy into content library |
| DELTA-REL-A4 | DEC-010 | Expand Further → typed relationships; Add-ons = presentation_cta |
| DELTA-THEME-A4 | DEC-006 | A4 channel green override; preserve accents |
| DELTA-RELEASE | DEC-005 | Product OS release V2.07; separate template version |
| DELTA-PRICE-POLICY | DEC-011 | Structured qualifiers; E-06 (Smart Toilet) supply-only exceptions |
