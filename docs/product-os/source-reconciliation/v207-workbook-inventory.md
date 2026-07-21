# Product OS V2.07 — Workbook Inventory

- Date: 2026-07-18
- Phase: 2 (read-only)
- Source file: `docs/product-os/source/Better_Home_Product_Database_V2.07.xlsx`
- Size: 84783 bytes
- SHA-256: `5e6bd55401f2ba0df37d60aa5cd52ccf3129c822dffd80c40d0fe10da4ca620f`
- Modified: 2026-07-18 10:11:29 +0930
- Status: readable / immutable approved snapshot
- Sheet count: **22**
- Method: `xlsx` read-only parse; row numbers are **not** permanent IDs

---

## Source snapshot verification

| Field | Value |
|---|---|
| Exact filename | `Better_Home_Product_Database_V2.07.xlsx` |
| File size | 84783 |
| SHA-256 | `5e6bd55401f2ba0df37d60aa5cd52ccf3129c822dffd80c40d0fe10da4ca620f` |
| Modified timestamp | 2026-07-18 10:11:29 +0930 |
| Readable | Yes |

Companion approved sources (same directory, same mtime batch):

| File | Size | SHA-256 |
|---|---:|---|
| `A4_Content_Mapping_Review_V1.md` | 37494 | `a68587aadff15df830b570ee5d83a30db7c3e1b398623980455e217c663b77a8` |
| `Better_Home_Collections_A4_Review_Set_V1.pdf` | 7338416 | `f16c53443b49d71478732fb94dbb0bcc85a5968e645f286167e918f47123fff8` |

---

## Sheet inventory (all 22)

### 00_ReadMe
- **Purpose:** Workbook title / purpose note
- **Data rows:** 11 | **Cols:** 2
- **Headers:** freeform title cells (not a tabular schema)
- **Stable ID:** none
- **FK-like:** none
- **Formula:** 0
- **Legacy:** No
- **V2 context:** Governance / documentation
- **Notes:** Labels workbook as “Frozen Product OS for A4 sales-sheet generation”

### 01_Settings
- **Purpose:** Costing parameters (labour rates, overhead, GST reference)
- **Data rows:** 7 | **Cols:** 4
- **Headers:** Parameter, Value, Unit, Notes
- **Stable ID:** Parameter name (string)
- **FK-like:** none
- **Formula:** 2 cells (Overhead Rate, Loaded Labour Rate)
- **Calculated/display:** Overhead Rate, Loaded Labour Rate
- **Legacy:** No
- **V2 context:** Pricing / costing_settings
- **Notes:** GST noted as 10% reference; costs ex-GST; prices elsewhere incl GST

### 02_Labour_Library
- **Purpose:** Canonical labour items and hours
- **Data rows:** 36 | **Cols:** 4
- **Headers:** Labour Item, Hours, Category, Notes
- **Stable ID:** Labour Item (string; no Labour ID)
- **FK-like:** referenced by name from 08_Product_Labour
- **Duplicates:** none detected on Labour Item
- **Formula:** 0
- **Legacy:** No
- **V2 context:** Scope and BOM → labour_library

### 03_SKU_Master
- **Purpose:** Equipment / SKU catalogue and unit cost
- **Data rows:** 49 | **Cols:** 7
- **Headers:** SKU, Product, Capability Category, Unit Cost ex GST, Supplier, Status, Notes
- **Stable ID:** SKU code (unique; 0 duplicates)
- **FK-like:** SKU referenced by 07_Product_BOM
- **Formula:** 0
- **Legacy:** No
- **V2 context:** Scope and BOM → equipment_skus
- **Notes:** Column “Product” here is SKU product name, not Product ID

### 04_Product_Master
- **Purpose:** Product identity, type, coverage, duplicated hero/subtitle/accent/price
- **Data rows:** 14 | **Cols:** 14
- **Headers:** Product ID, Code, Type, Name, Version, Status, Core Value, Primary Emotion, Coverage, Hero Statement, Subtitle, Accent Colour, Final Customer Price incl GST, Notes
- **Stable ID:** Product ID (F-01, C-01…C-06, E-01…E-07) — unique
- **FK-like:** Product ID is hub for most sheets
- **Types observed:** Infrastructure, Collection, Experience Pack, Bonus, Product Pack, Standalone Product
- **Version column:** all rows show `2.06` (despite workbook filename V2.07)
- **Formula:** 0
- **Duplicates:** Hero/Subtitle/Accent/Price also in Content/Theme/Pricing sheets
- **Legacy fields (authority):** Hero, Subtitle, Accent, Price should not remain canonical
- **V2 context:** Product Catalogue (+ temporary cache fields)
- **Products:** F-01 Foundation; C-01…C-06 Collections; E-01 Mood Lighting; E-02 Climate; E-03 Healthy Air; E-04 Garden Care; E-05 Protection Bonus ($0); E-06 CCTV; E-07 Smart Toilet

### 05_Product_Experiences
- **Purpose:** Canonical experience titles/descriptions per product
- **Data rows:** 46 | **Cols:** 5
- **Headers:** Product ID, Sequence, Experience Title, Customer-Facing Description, Status
- **Stable ID:** **Missing** Experience ID (sequence+title unsafe)
- **FK-like:** Product ID → 04
- **Counts (Collections):** C-01:4, C-02:5, C-03:4, C-04:4, C-05:3, C-06:4
- **Formula:** 0
- **V2 context:** Capability and Relationships / product_experiences
- **Notes:** A4 groupings often differ (see A4 mapping)

### 06_Product_Capabilities
- **Purpose:** Included capabilities and quantities (customer/product scope facts)
- **Data rows:** 54 | **Cols:** 5
- **Headers:** Product ID, Capability, Included Qty, Customer Layer, Notes
- **Stable ID:** **Missing** Capability ID
- **FK-like:** Product ID → 04; BOM validates technically
- **Formula:** 0
- **Notable rows:**
  - C-03: `Warm Kickboard Zone` (notes: up to 3m dimmable warm silicone strip)
  - C-05: `6-Circuit Light Switch` notes: Compatible lighting / fan / heating circuits
  - C-01: Smart Lock, Outdoor PIR, Indoor Occupancy — **no door contact**
- **V2 context:** Capability and Relationships + Scope

### 07_Product_BOM
- **Purpose:** Technical BOM quantities and line costs
- **Data rows:** 67 | **Cols:** 7
- **Headers:** Product ID, SKU, Qty, Unit Cost ex GST, Line Cost, Included / Add-on, Notes
- **Stable ID:** (Product ID + SKU) composite; no BOM line ID
- **FK-like:** Product ID → 04; SKU → 03
- **Formula:** 134 cells (Line Cost etc.)
- **Calculated:** Line Cost
- **V2 context:** Scope and BOM
- **Must not** drive customer wording
- **Notable:** C-03 WW-STRIP-3 notes = `Kickboard`

### 08_Product_Labour
- **Purpose:** Labour attach quantities and costs
- **Data rows:** 87 | **Cols:** 8
- **Headers:** Product ID, Labour Item, Qty, Hours Each, Total Hours, Loaded Rate, Labour Cost, Notes
- **Stable ID:** none (Product ID + Labour Item)
- **FK-like:** Product ID; Labour Item → 02
- **Formula:** 348 cells
- **Calculated:** Total Hours, Labour Cost
- **V2 context:** Scope and BOM → labour_versions/items

### 09_Product_Rules
- **Purpose:** Product boundaries, exclusions, installation/quote conditions
- **Data rows:** 47 | **Cols:** 4
- **Headers:** Product ID, Rule Key, Rule Value, Notes
- **Stable ID:** **Missing** Rule ID
- **FK-like:** Product ID
- **Formula:** 0
- **V2 context:** Rules and Automation
- **Notes:** Free-form key/value; hard to validate automatically

### 10_Pricing_Summary
- **Purpose:** Calculated material/labour/direct cost, customer price, margin
- **Data rows:** 14 | **Cols:** 11
- **Headers:** Product ID, Name, Type, Material Cost ex GST, Labour Cost ex GST, Direct Cost ex GST, Customer Price incl GST, Gross Profit ex GST, Gross Margin, Status, Notes
- **Stable ID:** Product ID
- **Formula:** 140 cells
- **Calculated/display:** Material/Labour/Direct/GP/Margin
- **Authoritative for A4 numeric price:** yes (per A4 review)
- **Missing:** Exact/From/Contact, Installed/Supply-only structured fields (E-07 Smart Toilet is supply-only per Review Notes)
- **V2 context:** Pricing

### 11_Add_Ons
- **Purpose:** Canonical Add-on catalogue: name, promise, parent eligibility, scope unit, price
- **Data rows:** 32 | **Cols:** 10
- **Headers:** Add-on ID, Canonical Product Name, Experience Promise, Parent Product ID, Standard Scope Unit, Default SKU / Capability, Direct Cost Formula Basis, Customer Price incl GST, Status, Installation Assumptions
- **Stable ID:** Add-on ID (AO-001…; unique)
- **FK-like:** Parent Product ID is slash-delimited multi-parent string (e.g. `C-01/C-02/...`) — needs normalization
- **Formula:** 0
- **Missing:** featured sequence / A4 visibility mapping
- **V2 context:** Product Catalogue (ADDON) + addon_parent_eligibility + product_prices

### 12_Product_Card_Content — **LEGACY**
- **Purpose:** Old front moments / footer / closing quote
- **Data rows:** 16 | **Cols:** 6
- **Headers:** Product ID, Section, Sequence, Text, (empty), Legacy Note
- **Stable ID:** none
- **Coverage:** Only C-02, C-04, C-06 (partial)
- **Legacy Note:** “Use 14_Content_Library going forward.”
- **Conflicts with approved A4 moments** (esp. Bedroom Sleep Comfort vs approved set; Away Leave with Confidence / Holiday Mode vs approved Leave/Settle/Aware/Return)
- **V2 context:** Legacy archive only — **not canonical**
- **Runtime:** no new system may read

### 13_Roadmap
- **Purpose:** Phase roadmap notes
- **Data rows:** 6 | **Cols:** 4
- **Headers:** Phase, Focus, Status, Notes
- **V2 context:** Governance (non-runtime)

### 14_Content_Library — **primary future customer-content source**
- **Purpose:** Customer language rows
- **Data rows:** 56 | **Cols:** 8
- **Headers:** Product ID, Content Type, Content Key, Sequence, Title, Body, Status, Notes
- **Content types present:** Hero (14), Subtitle (14), Story (14), Footer (14) — **only these four**
- **Stable ID:** Content Key per product (no Content ID column)
- **Missing vs A4:** story_title (story title currently product name), front moments, problem, response, experience copy, expansion promise, assumption copy
- **Conflicts:** Story body differs from approved A4 for Collections
- **V2 context:** Customer Content
- **Authority:** intended primary for customer copy (A4 review)

### 15_Icon_Library
- **Purpose:** Optional Lucide icon metadata
- **Data rows:** 28 | **Cols:** 6
- **Headers:** Product ID, Content Key, Lucide Icon Name, Icon Purpose, Status, Notes
- **V2 context:** Assets (optional)
- **Notes:** Not required by current Collection A4 design

### 16_Image_Library
- **Purpose:** Hero image path placeholders
- **Data rows:** 13 | **Cols:** 6
- **Headers:** Product ID, Image Type, File Path, Alt Text, Status, Notes
- **Paths:** generic `/assets/products/{id}/hero.jpg`
- **Missing:** Asset ID, crop, focal point, rights, version/hash of reviewed PDF imagery
- **V2 context:** Assets and Presentation

### 17_Theme_Library
- **Purpose:** Per-product accent/background/text colours
- **Data rows:** 14 | **Cols:** 7
- **Headers:** Product ID, Accent Colour, Background Colour, Text Colour, Theme Name, Status, Notes
- **Conflict:** A4 uses unified Better Home green; library stores distinct accents (e.g. C-01 `#B68A4A`)
- **Also duplicated** Accent on Product Master
- **V2 context:** Assets and Presentation (channel-aware tokens)

### 18_Layout_Config
- **Purpose:** Template and section counts / flags
- **Data rows:** 13 | **Cols:** 9
- **Headers:** Product ID, Template, Front Moments Count, Back Experiences Count, Show Price, Show Included, Show Compatible Experience Packs, Status, Notes
- **Conflicts:** Back Experiences Count vs A4 (C-01 4 vs 5; C-03 4 vs 5; C-04 4 vs 5; C-05 3 vs 5; C-06 4 vs 5)
- **C-06:** Show Compatible Experience Packs = FALSE but A4 shows Expand Further (Entry/CCTV/Protection)
- **V2 context:** Assets and Presentation — needs relationship-type visibility, not only “compatible packs”

### 19_Automation_Library
- **Purpose:** Trigger / condition / action technical truth
- **Data rows:** 21 | **Cols:** 7
- **Headers:** Product ID, Automation Name, Trigger, Condition, Action, Status, Notes
- **Stable ID:** **Missing** Automation ID
- **C-06 automations:** Leave Home, Away Mode, Holiday Mode — **no Return Routine**
- **V2 context:** Rules and Automation
- **Notes:** Customer pages may paraphrase; must not invent unsupported behaviour

### 20_Product_Review
- **Purpose:** Freeze/review gate notes and prices
- **Data rows:** 15 | **Cols:** 4
- **Headers:** Product, Status, Price incl GST, Review Notes
- **Stable ID:** Product name (weaker than Product ID)
- **V2 context:** Governance / releases
- **Notable:** Away price 1499; Smart Toilet supply-only note; Protection free bonus

### CHANGELOG
- **Purpose:** Version history
- **Data rows:** 16 | **Cols:** 3
- **Headers:** Version, Product, Status
- **V2.06 entries:** pricing GST reconciliation, product scope changes, Away price to $1499, Add-on catalogue, etc.
- **V2.07 entries:** Canonical hierarchy Foundation→Collection→Experience→Add-on; Add-on canonical names + Experience Promise; channel consistency
- **Implication:** Workbook **filename** V2.07 records language/Add-on freeze; Product Master **Version** field still `2.06`; A4 footer shows V2.06 → release-label conflict (ISSUE-005)

---

## Cross-sheet identifier summary

| Identifier | Present | Unique | Notes |
|---|---|---|---|
| Product ID | Yes (04) | Yes | Hub key |
| SKU | Yes (03) | Yes | |
| Add-on ID | Yes (11) | Yes | |
| Experience ID | **No** | — | Sequence/title only |
| Capability ID | **No** | — | Name only |
| Rule ID | **No** | — | |
| Automation ID | **No** | — | |
| Content ID | **No** | — | Content Key only |
| Asset ID | **No** | — | Path only |
| Relationship ID | **No** | — | No relationships sheet |

---

## Inventory completeness check
- All **22** worksheets inventoried: Yes
- Placeholder `definitions/*.json` used as authority: **No**
- Source files modified: **No**
