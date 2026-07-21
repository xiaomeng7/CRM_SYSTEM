# Phase 4A.1 — Sheet Disposition Matrix

- Generated: offline Phase 4A.1 gate
- Workbook sheets: 22
- Neon: none

| Sheet | Authority role | Import status | Target context | Rows read | Rows planned | Rows skipped | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 00_ReadMe | DOCUMENTATION | REFERENCE_ONLY | Governance notes | 11 | 0 | 0 | Human readme; no catalogue facts |
| 01_Settings | COSTING_SETTINGS | AUTHORITATIVE_IMPORTED | costing_settings (internal); GST reference | 7 | 7 | 0 | Loaded labour / GST reference; costs never customer-facing |
| 02_Labour_Library | LABOUR_LIBRARY | AUTHORITATIVE_IMPORTED | labour_library | 36 | 36 | 0 | Technical labour catalogue |
| 03_SKU_Master | EQUIPMENT_SKU | AUTHORITATIVE_IMPORTED | equipment_skus | 49 | 49 | 0 | SKU identity + supplier; unit cost internal-only |
| 04_Product_Master | PRODUCT_IDENTITY | AUTHORITATIVE_IMPORTED | products / versions / aliases / benefits | 14 | 14 | 1 | Identity + kind×role; hero/price/accent non-authoritative cache |
| 05_Product_Experiences | EXPERIENCE_FACTS | AUTHORITATIVE_IMPORTED | product_experiences | 46 | 46 | 0 | Canonical experience inventory (DEC-009); A4 map separate |
| 06_Product_Capabilities | CAPABILITY_SCOPE | AUTHORITATIVE_IMPORTED | capabilities + inclusions | 54 | 54 | 0 | Included scope facts; DEC overlays may rename/qualify |
| 07_Product_BOM | BOM_TECHNICAL | AUTHORITATIVE_IMPORTED | bom_versions + bom_items | 67 | 67 | 0 | Technical quantities; never drives customer wording |
| 08_Product_Labour | LABOUR_APPLICATION | AUTHORITATIVE_IMPORTED | labour_versions + items | 87 | 87 | 0 | Internal labour application; costing redacted in artifacts |
| 09_Product_Rules | PRODUCT_RULES | AUTHORITATIVE_IMPORTED | rule_definitions | 47 | 47 | 0 | Boundary rules; free-form keys normalized to stable codes |
| 10_Pricing_Summary | CUSTOMER_PRICE | AUTHORITATIVE_IMPORTED | product_prices | 14 | 13 | 1 | Customer price authority; Protection SKIP_PRICE; costing internal |
| 11_Add_Ons | ADDON_CATALOGUE | AUTHORITATIVE_IMPORTED | addon products + eligibility + prices | 32 | 32 | 0 | Add-on products; parent eligibility remapped |
| 12_Product_Card_Content | LEGACY_CONTENT | LEGACY_SKIPPED | none (audit archive only) | 16 | 0 | 16 | DEC-012 / ISSUE-017 — non-authoritative; use 14_Content_Library |
| 13_Roadmap | ROADMAP | INTENTIONALLY_SKIPPED | none | 6 | 0 | 6 | Future roadmap; not catalogue facts for V2.07 release |
| 14_Content_Library | CUSTOMER_CONTENT | AUTHORITATIVE_IMPORTED | content_entries | 56 | 52 | 4 | Customer content authority for present rows; A4 verbatim gap = issue |
| 15_Icon_Library | ICON_ASSETS | AUTHORITATIVE_IMPORTED | asset metadata (icons) | 28 | 28 | 0 | Optional visual metadata; not A4 content dependency |
| 16_Image_Library | IMAGE_ASSETS | AUTHORITATIVE_IMPORTED | assets (publish-gated) | 13 | 13 | 0 | Paths imported as NOT_APPROVED_FOR_PUBLISH until originals registered (DEC-007) |
| 17_Theme_Library | THEME | AUTHORITATIVE_IMPORTED | theme_tokens + channel override plan | 14 | 14 | 0 | Product accents; A4 green is channel override (DEC-006) |
| 18_Layout_Config | LAYOUT_POLICY | AUTHORITATIVE_DERIVED | layout policy (subordinate to presentation map) | 13 | 13 | 0 | Imported as reference; A4 presentation map wins on drift (ISSUE-018) |
| 19_Automation_Library | AUTOMATION | AUTHORITATIVE_IMPORTED | automation_definitions | 21 | 21 | 0 | Technical automation; DEC-004 Return Routine overlay planned |
| 20_Product_Review | GOVERNANCE_QA | REFERENCE_ONLY | release gate notes | 15 | 0 | 0 | QA/review notes; commercial exceptions inform DEC-011 fields |
| CHANGELOG | CHANGELOG | REFERENCE_ONLY | governance | 16 | 0 | 0 | Version history reference; Product OS release = V2.07 (DEC-005) |

## Skipped rows (all reasoned)

Total skippedActions: 28

| Sheet | Source row | Stable ref | Reason | Downstream impact |
| --- | --- | --- | --- | --- |
| 12_Product_Card_Content | 2 | legacy_card_row_2 | LEGACY_NON_AUTHORITATIVE | Customer copy must come from 14_Content_Library / A4 migrate (DEC-012) |
| 12_Product_Card_Content | 3 | legacy_card_row_3 | LEGACY_NON_AUTHORITATIVE | Customer copy must come from 14_Content_Library / A4 migrate (DEC-012) |
| 12_Product_Card_Content | 4 | legacy_card_row_4 | LEGACY_NON_AUTHORITATIVE | Customer copy must come from 14_Content_Library / A4 migrate (DEC-012) |
| 12_Product_Card_Content | 5 | legacy_card_row_5 | LEGACY_NON_AUTHORITATIVE | Customer copy must come from 14_Content_Library / A4 migrate (DEC-012) |
| 12_Product_Card_Content | 6 | legacy_card_row_6 | LEGACY_NON_AUTHORITATIVE | Customer copy must come from 14_Content_Library / A4 migrate (DEC-012) |
| 12_Product_Card_Content | 7 | legacy_card_row_7 | LEGACY_NON_AUTHORITATIVE | Customer copy must come from 14_Content_Library / A4 migrate (DEC-012) |
| 12_Product_Card_Content | 8 | legacy_card_row_8 | LEGACY_NON_AUTHORITATIVE | Customer copy must come from 14_Content_Library / A4 migrate (DEC-012) |
| 12_Product_Card_Content | 9 | legacy_card_row_9 | LEGACY_NON_AUTHORITATIVE | Customer copy must come from 14_Content_Library / A4 migrate (DEC-012) |
| 12_Product_Card_Content | 10 | legacy_card_row_10 | LEGACY_NON_AUTHORITATIVE | Customer copy must come from 14_Content_Library / A4 migrate (DEC-012) |
| 12_Product_Card_Content | 11 | legacy_card_row_11 | LEGACY_NON_AUTHORITATIVE | Customer copy must come from 14_Content_Library / A4 migrate (DEC-012) |
| 12_Product_Card_Content | 12 | legacy_card_row_12 | LEGACY_NON_AUTHORITATIVE | Customer copy must come from 14_Content_Library / A4 migrate (DEC-012) |
| 12_Product_Card_Content | 13 | legacy_card_row_13 | LEGACY_NON_AUTHORITATIVE | Customer copy must come from 14_Content_Library / A4 migrate (DEC-012) |
| 12_Product_Card_Content | 14 | legacy_card_row_14 | LEGACY_NON_AUTHORITATIVE | Customer copy must come from 14_Content_Library / A4 migrate (DEC-012) |
| 12_Product_Card_Content | 15 | legacy_card_row_15 | LEGACY_NON_AUTHORITATIVE | Customer copy must come from 14_Content_Library / A4 migrate (DEC-012) |
| 12_Product_Card_Content | 16 | legacy_card_row_16 | LEGACY_NON_AUTHORITATIVE | Customer copy must come from 14_Content_Library / A4 migrate (DEC-012) |
| 12_Product_Card_Content | 17 | legacy_card_row_17 | LEGACY_NON_AUTHORITATIVE | Customer copy must come from 14_Content_Library / A4 migrate (DEC-012) |
| 13_Roadmap | 2 | roadmap_2 | INTENTIONALLY_SKIPPED_ROADMAP | Not part of V2.07 catalogue import |
| 13_Roadmap | 3 | roadmap_3 | INTENTIONALLY_SKIPPED_ROADMAP | Not part of V2.07 catalogue import |
| 13_Roadmap | 4 | roadmap_4 | INTENTIONALLY_SKIPPED_ROADMAP | Not part of V2.07 catalogue import |
| 13_Roadmap | 5 | roadmap_5 | INTENTIONALLY_SKIPPED_ROADMAP | Not part of V2.07 catalogue import |
| 13_Roadmap | 6 | roadmap_6 | INTENTIONALLY_SKIPPED_ROADMAP | Not part of V2.07 catalogue import |
| 13_Roadmap | 7 | roadmap_7 | INTENTIONALLY_SKIPPED_ROADMAP | Not part of V2.07 catalogue import |
| 04_Product_Master |  | E-05 | SKIP_TO_INCLUDED_BENEFIT | Protection is benefit.protection_bonus on CCTV E-05 |
| 14_Content_Library | 46 | E-05:Hero:hero | PROTECTION_CONTENT_NOT_PRODUCT_PAGE | No independent Protection A4/product page content |
| 14_Content_Library | 47 | E-05:Subtitle:subtitle | PROTECTION_CONTENT_NOT_PRODUCT_PAGE | No independent Protection A4/product page content |
| 14_Content_Library | 48 | E-05:Story:story | PROTECTION_CONTENT_NOT_PRODUCT_PAGE | No independent Protection A4/product page content |
| 14_Content_Library | 49 | E-05:Footer:footer | PROTECTION_CONTENT_NOT_PRODUCT_PAGE | No independent Protection A4/product page content |
| 10_Pricing_Summary |  | E-05 | PROTECTION_NOT_PRICED | No product_prices for Protection Bonus |


