# Product OS V2 — ERD (Phase 1 Design + Phase 2A)

- Date: 2026-07-18
- Format: Mermaid erDiagram, split by bounded context for readability
- Status: Logical model — Phase 2A dual-axis taxonomy + experiences/presentation;
  **no physical migration**
- Sources: approved V2.07 + A4 snapshots; DEC-001…012 recorded

---

## Context map

```mermaid
flowchart LR
  A[Product Catalogue]
  B[Capability and Relationships]
  C[Scope and BOM]
  D[Rules and Automation]
  E[Pricing]
  F[Customer Content]
  G[Assets and Presentation]
  H[Governance and Releases]
  I[Import and Validation]

  A --> B
  A --> C
  A --> D
  A --> E
  A --> F
  A --> G
  H --> A
  H --> C
  H --> E
  H --> F
  I --> H
  B --> F
  G --> F
```

---

## 1. Product Catalogue (dual-axis)

```mermaid
erDiagram
  PRODUCT_KINDS ||--o{ PRODUCTS : kind
  COMMERCIAL_ROLES ||--o{ PRODUCTS : role
  PRODUCT_STATUSES ||--o{ PRODUCTS : status
  PRODUCTS ||--o{ PRODUCT_VERSIONS : versions
  PRODUCTS ||--o| ADDON_PROFILES : "if ADDON"
  PRODUCTS ||--o{ ADDON_PARENT_ELIGIBILITY : "as addon"
  PRODUCTS ||--o{ ADDON_PARENT_ELIGIBILITY : "as parent"
  PRODUCTS ||--o{ PRODUCT_FEATURED_ADDONS : features
  PRODUCTS ||--o{ INSTALLATION_ASSUMPTIONS : assumptions
  CAPABILITIES ||--o{ ADDON_PROFILES : extends

  PRODUCT_KINDS {
    string code PK
    string label
    int hierarchy_rank
  }
  COMMERCIAL_ROLES {
    string code PK
    string label
    boolean allows_independent_purchase
    boolean requires_unlock
  }
  PRODUCT_STATUSES {
    string code PK
    boolean allows_sale
  }
  PRODUCTS {
    uuid id PK
    string product_code UK
    string canonical_name
    string product_kind_code FK
    string commercial_role_code FK
    string status_code FK
    uuid parent_product_id FK
    boolean requires_foundation
  }
  PRODUCT_VERSIONS {
    uuid id PK
    uuid product_id FK
    string version_label
    string status
  }
  ADDON_PROFILES {
    uuid product_id PK_FK
    uuid extends_capability_id FK
    boolean creates_new_room
    boolean creates_new_experience
  }
  ADDON_PARENT_ELIGIBILITY {
    uuid id PK
    uuid addon_product_id FK
    uuid parent_product_id FK
    string status
  }
  PRODUCT_FEATURED_ADDONS {
    uuid id PK
    uuid parent_product_id FK
    uuid addon_product_id FK
    int sequence
  }
  INSTALLATION_ASSUMPTIONS {
    uuid id PK
    uuid product_id FK
    string layer
    string assumption_text
  }
```

**Classification (DEC-008):** F-01 FOUNDATION+STANDARD; C-01…C-06 COLLECTION+STANDARD;
E-05 CCTV EXPERIENCE+PACK; E-06 Smart Toilet STANDALONE+STANDARD; AO-* ADDON+STANDARD.
Protection = included benefit (not a product). Legacy workbook E-05/E-06/E-07 → see `legacy-id-crosswalk.md`.

---

## 2. Capability, Experiences, Relationships

```mermaid
erDiagram
  PRODUCTS ||--o{ PRODUCT_CAPABILITY_INCLUSIONS : includes
  CAPABILITIES ||--o{ PRODUCT_CAPABILITY_INCLUSIONS : capability
  PRODUCT_CAPABILITY_INCLUSIONS ||--o{ CAPABILITY_SUPPORT_LINKS : evidence
  PRODUCTS ||--o{ PRODUCT_EXPERIENCES : experiences
  PRODUCT_EXPERIENCES ||--o{ EXPERIENCE_PRESENTATION_MAPPINGS : present_as
  PRODUCTS ||--o{ PRODUCT_RELATIONSHIPS : from
  PRODUCTS ||--o{ PRODUCT_RELATIONSHIPS : to
  RELATIONSHIP_TYPES ||--o{ PRODUCT_RELATIONSHIPS : type
  PRODUCT_RELATIONSHIPS ||--o{ RELATIONSHIP_REQUIREMENTS : requires
  PRODUCTS ||--o{ RELATIONSHIP_REQUIREMENTS : required_product
  AUTOMATION_DEFINITIONS ||--o{ PRODUCT_EXPERIENCES : optional_link
  AUTOMATION_DEFINITIONS ||--o{ EXPERIENCE_PRESENTATION_MAPPINGS : optional_link

  CAPABILITIES {
    uuid id PK
    string capability_code UK
    string name
  }
  PRODUCT_CAPABILITY_INCLUSIONS {
    uuid id PK
    uuid product_id FK
    uuid capability_id FK
    decimal included_qty
  }
  PRODUCT_EXPERIENCES {
    uuid id PK
    string experience_code UK
    uuid product_id FK
    string canonical_title
    int sequence
  }
  EXPERIENCE_PRESENTATION_MAPPINGS {
    uuid id PK
    uuid experience_id FK
    string channel
    string surface_code
    string side_code
    string display_title
    int sort_order
    string grouping
    boolean visibility
  }
  RELATIONSHIP_TYPES {
    string code PK
  }
  PRODUCT_RELATIONSHIPS {
    uuid id PK
    uuid from_product_id FK
    uuid to_product_id FK
    string relationship_type_code FK
  }
  RELATIONSHIP_REQUIREMENTS {
    uuid id PK
    uuid relationship_id FK
    uuid required_product_id FK
  }
```

**Protection Bonus:** included benefit on CCTV (E-05); unlock requirements C-01 ∧ C-06 ∧ E-05.
**presentation_cta:** Expand Further “Add-ons” (no product target required).

---

## 3. Scope and BOM

```mermaid
erDiagram
  PRODUCTS ||--o{ SCOPE_GROUPS : has
  SCOPE_GROUPS ||--o{ SCOPE_ITEMS : contains
  CAPABILITIES ||--o{ SCOPE_ITEMS : links
  PRODUCTS ||--o{ BOM_VERSIONS : bom
  BOM_VERSIONS ||--o{ BOM_ITEMS : lines
  EQUIPMENT_SKUS ||--o{ BOM_ITEMS : sku
  PRODUCTS ||--o{ LABOUR_VERSIONS : labour
  LABOUR_VERSIONS ||--o{ LABOUR_ITEMS : lines
  LABOUR_LIBRARY ||--o{ LABOUR_ITEMS : item

  SCOPE_GROUPS {
    uuid id PK
    uuid product_id FK
    string group_code
    int sequence
  }
  SCOPE_ITEMS {
    uuid id PK
    uuid scope_group_id FK
    uuid capability_id FK
    decimal qty
    string standard_scope_unit
  }
  BOM_VERSIONS {
    uuid id PK
    uuid product_id FK
    string version_label
    string status
  }
  BOM_ITEMS {
    uuid id PK
    uuid bom_version_id FK
    uuid sku_id FK
    decimal qty
    string included_type
  }
  EQUIPMENT_SKUS {
    uuid id PK
    string sku_code UK
    decimal unit_cost_ex_gst
    string protocol
  }
  LABOUR_LIBRARY {
    uuid id PK
    string labour_item UK
    decimal hours
  }
  LABOUR_VERSIONS {
    uuid id PK
    uuid product_id FK
    string version_label
  }
  LABOUR_ITEMS {
    uuid id PK
    uuid labour_version_id FK
    uuid labour_library_id FK
    decimal qty
  }
```

---

## 4. Rules and Automation

```mermaid
erDiagram
  PRODUCTS ||--o{ RULE_DEFINITIONS : owns
  PRODUCTS ||--o{ PRODUCT_AUTOMATIONS : attaches
  AUTOMATION_DEFINITIONS ||--o{ PRODUCT_AUTOMATIONS : used_by
  AUTOMATION_DEFINITIONS ||--o{ AUTOMATION_CONDITIONS : if
  AUTOMATION_DEFINITIONS ||--o{ AUTOMATION_ACTIONS : then
  VALIDATION_RULES ||--o{ VALIDATION_RESULTS : produces

  RULE_DEFINITIONS {
    uuid id PK
    uuid product_id FK
    string rule_key
    string rule_value
  }
  AUTOMATION_DEFINITIONS {
    uuid id PK
    string automation_code UK
    string name
    string trigger_type
  }
  PRODUCT_AUTOMATIONS {
    uuid id PK
    uuid product_id FK
    uuid automation_id FK
    int sequence
  }
  AUTOMATION_CONDITIONS {
    uuid id PK
    uuid automation_id FK
    int sequence
    string condition_type
  }
  AUTOMATION_ACTIONS {
    uuid id PK
    uuid automation_id FK
    int sequence
    string action_type
  }
  VALIDATION_RULES {
    uuid id PK
    string rule_code UK
    string category
    string severity
  }
```

---

## 5. Pricing

```mermaid
erDiagram
  PRICE_BOOKS ||--o{ PRODUCT_PRICES : contains
  PRODUCTS ||--o{ PRODUCT_PRICES : priced
  TAX_BASES ||--o{ PRODUCT_PRICES : tax
  PRICE_DISPLAY_MODES ||--o{ PRODUCT_PRICES : display
  PRICE_FULFILMENT_MODES ||--o{ PRODUCT_PRICES : fulfilment

  PRICE_BOOKS {
    uuid id PK
    string code UK
    string currency_code
    date effective_from
  }
  PRODUCT_PRICES {
    uuid id PK
    uuid price_book_id FK
    uuid product_id FK
    decimal amount
    string currency_code
    string tax_basis_code FK
    string display_mode_code FK
    string fulfilment_mode_code FK
    string scope_basis
    boolean subject_to_installation_assumptions
    string version_label
    date effective_from
    date effective_to
  }
  TAX_BASES {
    string code PK
  }
  PRICE_DISPLAY_MODES {
    string code PK
  }
  PRICE_FULFILMENT_MODES {
    string code PK
  }
  PRODUCTS {
    uuid id PK
  }
```

---

## 6. Customer Content

```mermaid
erDiagram
  CONTENT_TYPES ||--o{ CONTENT_ENTRIES : typed
  CONTENT_LOCALES ||--o{ CONTENT_ENTRIES : localized
  CONTENT_ENTRIES ||--o{ PRODUCT_CONTENT_PLACEMENTS : placed
  PRODUCTS ||--o{ PRODUCT_CONTENT_PLACEMENTS : shows
  CONTENT_SURFACES ||--o{ PRODUCT_CONTENT_PLACEMENTS : surface
  CONTENT_SIDES ||--o{ PRODUCT_CONTENT_PLACEMENTS : side
  PRODUCTS ||--o{ LEGACY_PRODUCT_CARD_CONTENT : "legacy archive only"

  CONTENT_ENTRIES {
    uuid id PK
    string content_key
    string content_type_code FK
    string locale_code FK
    string version_label
    string status
    string title
    string body
  }
  PRODUCT_CONTENT_PLACEMENTS {
    uuid id PK
    uuid product_id FK
    uuid content_entry_id FK
    string surface_code FK
    string side_code FK
    int sequence
  }
  CONTENT_SURFACES {
    string code PK
  }
  CONTENT_SIDES {
    string code PK
  }
  CONTENT_TYPES {
    string code PK
  }
  CONTENT_LOCALES {
    string code PK
  }
  LEGACY_PRODUCT_CARD_CONTENT {
    uuid id PK
    uuid product_id FK
    string legacy_payload
  }
```

---

## 7. Assets and Presentation

```mermaid
erDiagram
  IMAGE_ASSETS ||--o{ IMAGE_CROPS : crops
  IMAGE_ASSETS ||--o{ PRODUCT_IMAGE_LINKS : used
  IMAGE_CROPS ||--o{ PRODUCT_IMAGE_LINKS : optional_crop
  PRODUCTS ||--o{ PRODUCT_IMAGE_LINKS : product
  THEMES ||--o{ THEME_TOKENS : tokens
  LAYOUT_TEMPLATES ||--o{ LAYOUT_CONFIGS : of
  PRODUCTS ||--o{ LAYOUT_CONFIGS : product_optional
  PRODUCTS ||--o{ FOOTER_CONFIGS : footer

  IMAGE_ASSETS {
    uuid id PK
    string asset_code UK
    string storage_uri
    string publish_status
    string version_label
    string rights_notes
  }
  IMAGE_CROPS {
    uuid id PK
    uuid asset_id FK
    string surface_code
    float focal_x
    float focal_y
    json crop_box
  }
  PRODUCT_IMAGE_LINKS {
    uuid id PK
    uuid product_id FK
    uuid asset_id FK
    uuid crop_id FK
    int sequence
  }
  THEMES {
    uuid id PK
    string theme_code UK
    string theme_scope
    string channel_code
  }
  THEME_TOKENS {
    uuid id PK
    uuid theme_id FK
    string token_key
    string token_value
  }
  LAYOUT_TEMPLATES {
    uuid id PK
    string template_code UK
    string surface_code
  }
  LAYOUT_CONFIGS {
    uuid id PK
    uuid template_id FK
    uuid product_id FK
    json definition
  }
  DOCUMENT_TEMPLATE_VERSIONS {
    uuid id PK
    string template_code
    string version_label
    string surface_code
  }
  FOOTER_CONFIGS {
    uuid id PK
    uuid product_id FK
    uuid content_entry_id FK
    string product_os_release_code
    string document_template_version
  }
```

---

## 8. Governance, Releases, Import

```mermaid
erDiagram
  RELEASES ||--o{ RELEASE_COMPONENTS : composed_of
  RELEASES ||--o{ VALIDATION_RESULTS : validated
  VALIDATION_RULES ||--o{ VALIDATION_RESULTS : rule
  IMPORT_BATCHES ||--o{ VALIDATION_RESULTS : from_import
  IMPORT_BATCHES ||--o{ SOURCE_PROVENANCE : rows
  PRODUCTS ||--o{ MIGRATION_ISSUES : affected
  RELEASES ||--o{ AUDIT_LOG : audited

  RELEASES {
    uuid id PK
    string release_code UK
    string status
    timestamp released_at
  }
  RELEASE_COMPONENTS {
    uuid id PK
    uuid release_id FK
    string component_kind
    uuid component_id
    uuid product_id
  }
  VALIDATION_RESULTS {
    uuid id PK
    uuid release_id FK
    uuid import_batch_id FK
    string rule_code
    boolean passed
    string severity
  }
  MIGRATION_ISSUES {
    uuid id PK
    string issue_id UK
    uuid affected_product_id FK
    string category
    string source_a
    string source_b
    string severity
    string status
  }
  IMPORT_BATCHES {
    uuid id PK
    string source_filename
    string source_sha256
    string mode
    string status
  }
  SOURCE_PROVENANCE {
    uuid id PK
    uuid import_batch_id FK
    string sheet_name
    int row_number
    uuid target_entity_id
  }
  AUDIT_LOG {
    uuid id PK
    string actor
    string action
    string entity_type
    uuid entity_id
  }
```

---

## Cardinality notes
- Every product has `product_kind` × `commercial_role` (ADR-005); BONUS is not a kind.
- One product has many prices over time (versioned); never one mutable price column;
  display wording is not stored in `amount` (DEC-011).
- One product has many BOM versions; release pins one BOM version.
- Content placements bind approved content entries; layout never embeds product facts.
- Add-on eligibility is many-to-many between Add-on products and parent products.
- Bonus unlock relationships use `relationship_requirements` for multi-product gates
  (C-01 ∧ C-06 ∧ E-05 CCTV → Protection included benefit).
- Canonical experiences map 1→N to channel presentation mappings (DEC-009).
- Product OS `releases` are distinct from `document_template_versions` (DEC-005).
- Image assets with `NOT_APPROVED_FOR_PUBLISH` must not silently publish (DEC-007).
