# Phase 4A.1 — Product-by-product Reconciliation

Protection Bonus is **not** listed as a product (benefit only).

## F-01 — Foundation

- Actual name: Foundation
- Kind / role: FOUNDATION / STANDARD
- Import readiness: **IMPORTABLE_BUT_NOT_PUBLISHABLE**
- Publish readiness: **NOT_PUBLISHABLE**
- Counts: exp 2, cap 4, BOM 6, rules 0, autos 0, content 4, addons 6

| Fact area | Source | Planned target | Count | Status | Issues |
| --- | --- | --- | --- | --- | --- |
| identity | 04_Product_Master | products | 1 | OK |  |
| name | 04_Product_Master | canonical_name | 1 | OK |  |
| kind | DEC-008 | productKind | 1 | OK |  |
| commercial_role | DEC-008 | commercialRole | 1 | OK |  |
| hero/subtitle/story | 14_Content_Library | content_entries | 3 | PARTIAL | A4 verbatim story may differ (DEC-012) |
| customer_experiences | 05_Product_Experiences | experiences | 2 | OK |  |
| capabilities | 06_Product_Capabilities | capabilities | 4 | OK |  |
| BOM | 07_Product_BOM | bom_items | 6 | OK |  |
| automation | 19_Automation_Library+deltas | automations | 0 | OK |  |
| dependencies | 09_Product_Rules | rules | 0 | PARTIAL |  |
| Expand Further | A4 / DEC-010 | relationships | 0 | MISSING | No structured relationship rows in ImportPlan |
| Add-ons | 11_Add_Ons | addon eligibility | 6 | OK |  |
| price | 10_Pricing_Summary | product_prices | 1 | OK |  |
| theme | 17_Theme_Library | themes | 1 | OK |  |
| images | 16_Image_Library | assets | 1 | NOT_PUBLISHABLE |  |
| A4 presentation | DEC-009/012 | presentation_map | 0 | MISSING | Structured A4 map not in plan |
| version | DEC-005 | product_os_release | 1 | OK |  |
| publish_eligibility | gates | publish | 0 | BLOCKED | Assets + A4 content gaps |

## C-01 — Entry Collection

- Actual name: Entry Collection
- Kind / role: COLLECTION / STANDARD
- Import readiness: **IMPORTABLE_BUT_NOT_PUBLISHABLE**
- Publish readiness: **NOT_PUBLISHABLE**
- Counts: exp 4, cap 6, BOM 6, rules 4, autos 2, content 4, addons 6

| Fact area | Source | Planned target | Count | Status | Issues |
| --- | --- | --- | --- | --- | --- |
| identity | 04_Product_Master | products | 1 | OK |  |
| name | 04_Product_Master | canonical_name | 1 | OK |  |
| kind | DEC-008 | productKind | 1 | OK |  |
| commercial_role | DEC-008 | commercialRole | 1 | OK |  |
| hero/subtitle/story | 14_Content_Library | content_entries | 3 | PARTIAL | A4 verbatim story may differ (DEC-012) |
| customer_experiences | 05_Product_Experiences | experiences | 4 | OK |  |
| capabilities | 06_Product_Capabilities | capabilities | 6 | OK |  |
| BOM | 07_Product_BOM | bom_items | 6 | OK |  |
| automation | 19_Automation_Library+deltas | automations | 2 | OK |  |
| dependencies | 09_Product_Rules | rules | 4 | OK |  |
| Expand Further | A4 / DEC-010 | relationships | 0 | MISSING | No structured relationship rows in ImportPlan |
| Add-ons | 11_Add_Ons | addon eligibility | 6 | OK |  |
| price | 10_Pricing_Summary | product_prices | 1 | OK |  |
| theme | 17_Theme_Library | themes | 1 | OK |  |
| images | 16_Image_Library | assets | 1 | NOT_PUBLISHABLE |  |
| A4 presentation | DEC-009/012 | presentation_map | 0 | MISSING | Structured A4 map not in plan |
| version | DEC-005 | product_os_release | 1 | OK |  |
| publish_eligibility | gates | publish | 0 | BLOCKED | Assets + A4 content gaps |
| DEC-001 door contact | DELTA-C01-DOOR | capability+BOM overlay | 1 | PLANNED |  |

## C-02 — Living Collection

- Actual name: Living Collection
- Kind / role: COLLECTION / STANDARD
- Import readiness: **IMPORTABLE_BUT_NOT_PUBLISHABLE**
- Publish readiness: **NOT_PUBLISHABLE**
- Counts: exp 5, cap 7, BOM 9, rules 4, autos 4, content 4, addons 7

| Fact area | Source | Planned target | Count | Status | Issues |
| --- | --- | --- | --- | --- | --- |
| identity | 04_Product_Master | products | 1 | OK |  |
| name | 04_Product_Master | canonical_name | 1 | OK |  |
| kind | DEC-008 | productKind | 1 | OK |  |
| commercial_role | DEC-008 | commercialRole | 1 | OK |  |
| hero/subtitle/story | 14_Content_Library | content_entries | 3 | PARTIAL | A4 verbatim story may differ (DEC-012) |
| customer_experiences | 05_Product_Experiences | experiences | 5 | OK |  |
| capabilities | 06_Product_Capabilities | capabilities | 7 | OK |  |
| BOM | 07_Product_BOM | bom_items | 9 | OK |  |
| automation | 19_Automation_Library+deltas | automations | 4 | OK |  |
| dependencies | 09_Product_Rules | rules | 4 | OK |  |
| Expand Further | A4 / DEC-010 | relationships | 0 | MISSING | No structured relationship rows in ImportPlan |
| Add-ons | 11_Add_Ons | addon eligibility | 7 | OK |  |
| price | 10_Pricing_Summary | product_prices | 1 | OK |  |
| theme | 17_Theme_Library | themes | 1 | OK |  |
| images | 16_Image_Library | assets | 1 | NOT_PUBLISHABLE |  |
| A4 presentation | DEC-009/012 | presentation_map | 0 | MISSING | Structured A4 map not in plan |
| version | DEC-005 | product_os_release | 1 | OK |  |
| publish_eligibility | gates | publish | 0 | BLOCKED | Assets + A4 content gaps |

## C-03 — Kitchen Collection

- Actual name: Kitchen Collection
- Kind / role: COLLECTION / STANDARD
- Import readiness: **IMPORTABLE_BUT_NOT_PUBLISHABLE**
- Publish readiness: **NOT_PUBLISHABLE**
- Counts: exp 4, cap 6, BOM 8, rules 2, autos 0, content 4, addons 6

| Fact area | Source | Planned target | Count | Status | Issues |
| --- | --- | --- | --- | --- | --- |
| identity | 04_Product_Master | products | 1 | OK |  |
| name | 04_Product_Master | canonical_name | 1 | OK |  |
| kind | DEC-008 | productKind | 1 | OK |  |
| commercial_role | DEC-008 | commercialRole | 1 | OK |  |
| hero/subtitle/story | 14_Content_Library | content_entries | 3 | PARTIAL | A4 verbatim story may differ (DEC-012) |
| customer_experiences | 05_Product_Experiences | experiences | 4 | OK |  |
| capabilities | 06_Product_Capabilities | capabilities | 6 | OK |  |
| BOM | 07_Product_BOM | bom_items | 8 | OK |  |
| automation | 19_Automation_Library+deltas | automations | 0 | OK |  |
| dependencies | 09_Product_Rules | rules | 2 | OK |  |
| Expand Further | A4 / DEC-010 | relationships | 0 | MISSING | No structured relationship rows in ImportPlan |
| Add-ons | 11_Add_Ons | addon eligibility | 6 | OK |  |
| price | 10_Pricing_Summary | product_prices | 1 | OK |  |
| theme | 17_Theme_Library | themes | 1 | OK |  |
| images | 16_Image_Library | assets | 1 | NOT_PUBLISHABLE |  |
| A4 presentation | DEC-009/012 | presentation_map | 0 | MISSING | Structured A4 map not in plan |
| version | DEC-005 | product_os_release | 1 | OK |  |
| publish_eligibility | gates | publish | 0 | BLOCKED | Assets + A4 content gaps |
| DEC-002 kickboard name | DELTA-C03-KICK | capability | 1 | OK |  |

## C-04 — Bedroom Collection

- Actual name: Bedroom Collection
- Kind / role: COLLECTION / STANDARD
- Import readiness: **IMPORTABLE_BUT_NOT_PUBLISHABLE**
- Publish readiness: **NOT_PUBLISHABLE**
- Counts: exp 4, cap 7, BOM 10, rules 2, autos 3, content 4, addons 8

| Fact area | Source | Planned target | Count | Status | Issues |
| --- | --- | --- | --- | --- | --- |
| identity | 04_Product_Master | products | 1 | OK |  |
| name | 04_Product_Master | canonical_name | 1 | OK |  |
| kind | DEC-008 | productKind | 1 | OK |  |
| commercial_role | DEC-008 | commercialRole | 1 | OK |  |
| hero/subtitle/story | 14_Content_Library | content_entries | 3 | PARTIAL | A4 verbatim story may differ (DEC-012) |
| customer_experiences | 05_Product_Experiences | experiences | 4 | OK |  |
| capabilities | 06_Product_Capabilities | capabilities | 7 | OK |  |
| BOM | 07_Product_BOM | bom_items | 10 | OK |  |
| automation | 19_Automation_Library+deltas | automations | 3 | OK |  |
| dependencies | 09_Product_Rules | rules | 2 | OK |  |
| Expand Further | A4 / DEC-010 | relationships | 0 | MISSING | No structured relationship rows in ImportPlan |
| Add-ons | 11_Add_Ons | addon eligibility | 8 | OK |  |
| price | 10_Pricing_Summary | product_prices | 1 | OK |  |
| theme | 17_Theme_Library | themes | 1 | OK |  |
| images | 16_Image_Library | assets | 1 | NOT_PUBLISHABLE |  |
| A4 presentation | DEC-009/012 | presentation_map | 0 | MISSING | Structured A4 map not in plan |
| version | DEC-005 | product_os_release | 1 | OK |  |
| publish_eligibility | gates | publish | 0 | BLOCKED | Assets + A4 content gaps |

## C-05 — Bathroom Collection

- Actual name: Bathroom Collection
- Kind / role: COLLECTION / STANDARD
- Import readiness: **IMPORTABLE_BUT_NOT_PUBLISHABLE**
- Publish readiness: **NOT_PUBLISHABLE**
- Counts: exp 3, cap 5, BOM 6, rules 2, autos 1, content 4, addons 5

| Fact area | Source | Planned target | Count | Status | Issues |
| --- | --- | --- | --- | --- | --- |
| identity | 04_Product_Master | products | 1 | OK |  |
| name | 04_Product_Master | canonical_name | 1 | OK |  |
| kind | DEC-008 | productKind | 1 | OK |  |
| commercial_role | DEC-008 | commercialRole | 1 | OK |  |
| hero/subtitle/story | 14_Content_Library | content_entries | 3 | PARTIAL | A4 verbatim story may differ (DEC-012) |
| customer_experiences | 05_Product_Experiences | experiences | 3 | OK |  |
| capabilities | 06_Product_Capabilities | capabilities | 5 | OK |  |
| BOM | 07_Product_BOM | bom_items | 6 | OK |  |
| automation | 19_Automation_Library+deltas | automations | 1 | OK |  |
| dependencies | 09_Product_Rules | rules | 2 | OK |  |
| Expand Further | A4 / DEC-010 | relationships | 0 | MISSING | No structured relationship rows in ImportPlan |
| Add-ons | 11_Add_Ons | addon eligibility | 5 | OK |  |
| price | 10_Pricing_Summary | product_prices | 1 | OK |  |
| theme | 17_Theme_Library | themes | 1 | OK |  |
| images | 16_Image_Library | assets | 1 | NOT_PUBLISHABLE |  |
| A4 presentation | DEC-009/012 | presentation_map | 0 | MISSING | Structured A4 map not in plan |
| version | DEC-005 | product_os_release | 1 | OK |  |
| publish_eligibility | gates | publish | 0 | BLOCKED | Assets + A4 content gaps |
| DEC-003 circuit qualifier | DELTA-C05-CIRCUIT | qualifier | 1 | OK |  |

## C-06 — Away Collection

- Actual name: Away Collection
- Kind / role: COLLECTION / STANDARD
- Import readiness: **IMPORTABLE_BUT_NOT_PUBLISHABLE**
- Publish readiness: **NOT_PUBLISHABLE**
- Counts: exp 4, cap 1, BOM 1, rules 4, autos 3, content 4, addons 1

| Fact area | Source | Planned target | Count | Status | Issues |
| --- | --- | --- | --- | --- | --- |
| identity | 04_Product_Master | products | 1 | OK |  |
| name | 04_Product_Master | canonical_name | 1 | OK |  |
| kind | DEC-008 | productKind | 1 | OK |  |
| commercial_role | DEC-008 | commercialRole | 1 | OK |  |
| hero/subtitle/story | 14_Content_Library | content_entries | 3 | PARTIAL | A4 verbatim story may differ (DEC-012) |
| customer_experiences | 05_Product_Experiences | experiences | 4 | OK |  |
| capabilities | 06_Product_Capabilities | capabilities | 1 | OK |  |
| BOM | 07_Product_BOM | bom_items | 1 | OK |  |
| automation | 19_Automation_Library+deltas | automations | 4 | OK |  |
| dependencies | 09_Product_Rules | rules | 4 | OK |  |
| Expand Further | A4 / DEC-010 | relationships | 0 | MISSING | No structured relationship rows in ImportPlan |
| Add-ons | 11_Add_Ons | addon eligibility | 1 | OK |  |
| price | 10_Pricing_Summary | product_prices | 1 | OK |  |
| theme | 17_Theme_Library | themes | 1 | OK |  |
| images | 16_Image_Library | assets | 1 | NOT_PUBLISHABLE |  |
| A4 presentation | DEC-009/012 | presentation_map | 0 | MISSING | Structured A4 map not in plan |
| version | DEC-005 | product_os_release | 1 | OK |  |
| publish_eligibility | gates | publish | 0 | BLOCKED | Assets + A4 content gaps |
| DEC-004 Return Routine | DELTA-C06-RETURN | automation | 1 | PLANNED |  |

## E-01 — Mood Lighting

- Actual name: Mood Lighting
- Kind / role: EXPERIENCE / STANDARD
- Import readiness: **IMPORTABLE_BUT_NOT_PUBLISHABLE**
- Publish readiness: **NOT_PUBLISHABLE**
- Counts: exp 3, cap 3, BOM 4, rules 3, autos 1, content 4, addons 2

| Fact area | Source | Planned target | Count | Status | Issues |
| --- | --- | --- | --- | --- | --- |
| identity | 04_Product_Master | products | 1 | OK |  |
| name | 04_Product_Master | canonical_name | 1 | OK |  |
| kind | DEC-008 | productKind | 1 | OK |  |
| commercial_role | DEC-008 | commercialRole | 1 | OK |  |
| hero/subtitle/story | 14_Content_Library | content_entries | 3 | PARTIAL | A4 verbatim story may differ (DEC-012) |
| customer_experiences | 05_Product_Experiences | experiences | 3 | OK |  |
| capabilities | 06_Product_Capabilities | capabilities | 3 | OK |  |
| BOM | 07_Product_BOM | bom_items | 4 | OK |  |
| automation | 19_Automation_Library+deltas | automations | 1 | OK |  |
| dependencies | 09_Product_Rules | rules | 3 | OK |  |
| Expand Further | A4 / DEC-010 | relationships | 0 | MISSING | No structured relationship rows in ImportPlan |
| Add-ons | 11_Add_Ons | addon eligibility | 2 | OK |  |
| price | 10_Pricing_Summary | product_prices | 1 | OK |  |
| theme | 17_Theme_Library | themes | 1 | OK |  |
| images | 16_Image_Library | assets | 1 | NOT_PUBLISHABLE |  |
| A4 presentation | DEC-009/012 | presentation_map | 0 | MISSING | Structured A4 map not in plan |
| version | DEC-005 | product_os_release | 1 | OK |  |
| publish_eligibility | gates | publish | 0 | BLOCKED | Assets + A4 content gaps |

## E-02 — Climate

- Actual name: Climate
- Kind / role: EXPERIENCE / STANDARD
- Import readiness: **IMPORTABLE_BUT_NOT_PUBLISHABLE**
- Publish readiness: **NOT_PUBLISHABLE**
- Counts: exp 2, cap 2, BOM 3, rules 3, autos 1, content 4, addons 1

| Fact area | Source | Planned target | Count | Status | Issues |
| --- | --- | --- | --- | --- | --- |
| identity | 04_Product_Master | products | 1 | OK |  |
| name | 04_Product_Master | canonical_name | 1 | OK |  |
| kind | DEC-008 | productKind | 1 | OK |  |
| commercial_role | DEC-008 | commercialRole | 1 | OK |  |
| hero/subtitle/story | 14_Content_Library | content_entries | 3 | PARTIAL | A4 verbatim story may differ (DEC-012) |
| customer_experiences | 05_Product_Experiences | experiences | 2 | OK |  |
| capabilities | 06_Product_Capabilities | capabilities | 2 | OK |  |
| BOM | 07_Product_BOM | bom_items | 3 | OK |  |
| automation | 19_Automation_Library+deltas | automations | 1 | OK |  |
| dependencies | 09_Product_Rules | rules | 3 | OK |  |
| Expand Further | A4 / DEC-010 | relationships | 0 | MISSING | No structured relationship rows in ImportPlan |
| Add-ons | 11_Add_Ons | addon eligibility | 1 | OK |  |
| price | 10_Pricing_Summary | product_prices | 1 | OK |  |
| theme | 17_Theme_Library | themes | 1 | OK |  |
| images | 16_Image_Library | assets | 1 | NOT_PUBLISHABLE |  |
| A4 presentation | DEC-009/012 | presentation_map | 0 | MISSING | Structured A4 map not in plan |
| version | DEC-005 | product_os_release | 1 | OK |  |
| publish_eligibility | gates | publish | 0 | BLOCKED | Assets + A4 content gaps |

## E-03 — Healthy Air

- Actual name: Healthy Air
- Kind / role: EXPERIENCE / STANDARD
- Import readiness: **IMPORTABLE_BUT_NOT_PUBLISHABLE**
- Publish readiness: **NOT_PUBLISHABLE**
- Counts: exp 3, cap 5, BOM 5, rules 8, autos 3, content 4, addons 0

| Fact area | Source | Planned target | Count | Status | Issues |
| --- | --- | --- | --- | --- | --- |
| identity | 04_Product_Master | products | 1 | OK |  |
| name | 04_Product_Master | canonical_name | 1 | OK |  |
| kind | DEC-008 | productKind | 1 | OK |  |
| commercial_role | DEC-008 | commercialRole | 1 | OK |  |
| hero/subtitle/story | 14_Content_Library | content_entries | 3 | PARTIAL | A4 verbatim story may differ (DEC-012) |
| customer_experiences | 05_Product_Experiences | experiences | 3 | OK |  |
| capabilities | 06_Product_Capabilities | capabilities | 5 | OK |  |
| BOM | 07_Product_BOM | bom_items | 5 | OK |  |
| automation | 19_Automation_Library+deltas | automations | 3 | OK |  |
| dependencies | 09_Product_Rules | rules | 8 | OK |  |
| Expand Further | A4 / DEC-010 | relationships | 0 | MISSING | No structured relationship rows in ImportPlan |
| Add-ons | 11_Add_Ons | addon eligibility | 0 | OK |  |
| price | 10_Pricing_Summary | product_prices | 1 | OK |  |
| theme | 17_Theme_Library | themes | 1 | OK |  |
| images | 16_Image_Library | assets | 1 | NOT_PUBLISHABLE |  |
| A4 presentation | DEC-009/012 | presentation_map | 0 | MISSING | Structured A4 map not in plan |
| version | DEC-005 | product_os_release | 1 | OK |  |
| publish_eligibility | gates | publish | 0 | BLOCKED | Assets + A4 content gaps |

## E-04 — Garden Care

- Actual name: Garden Care
- Kind / role: EXPERIENCE / STANDARD
- Import readiness: **IMPORTABLE_BUT_NOT_PUBLISHABLE**
- Publish readiness: **NOT_PUBLISHABLE**
- Counts: exp 3, cap 3, BOM 4, rules 4, autos 1, content 4, addons 1

| Fact area | Source | Planned target | Count | Status | Issues |
| --- | --- | --- | --- | --- | --- |
| identity | 04_Product_Master | products | 1 | OK |  |
| name | 04_Product_Master | canonical_name | 1 | OK |  |
| kind | DEC-008 | productKind | 1 | OK |  |
| commercial_role | DEC-008 | commercialRole | 1 | OK |  |
| hero/subtitle/story | 14_Content_Library | content_entries | 3 | PARTIAL | A4 verbatim story may differ (DEC-012) |
| customer_experiences | 05_Product_Experiences | experiences | 3 | OK |  |
| capabilities | 06_Product_Capabilities | capabilities | 3 | OK |  |
| BOM | 07_Product_BOM | bom_items | 4 | OK |  |
| automation | 19_Automation_Library+deltas | automations | 1 | OK |  |
| dependencies | 09_Product_Rules | rules | 4 | OK |  |
| Expand Further | A4 / DEC-010 | relationships | 0 | MISSING | No structured relationship rows in ImportPlan |
| Add-ons | 11_Add_Ons | addon eligibility | 1 | OK |  |
| price | 10_Pricing_Summary | product_prices | 1 | OK |  |
| theme | 17_Theme_Library | themes | 1 | OK |  |
| images | 16_Image_Library | assets | 1 | NOT_PUBLISHABLE |  |
| A4 presentation | DEC-009/012 | presentation_map | 0 | MISSING | Structured A4 map not in plan |
| version | DEC-005 | product_os_release | 1 | OK |  |
| publish_eligibility | gates | publish | 0 | BLOCKED | Assets + A4 content gaps |

## E-05 — CCTV

- Actual name: CCTV
- Kind / role: EXPERIENCE / PACK
- Import readiness: **IMPORTABLE_BUT_NOT_PUBLISHABLE**
- Publish readiness: **NOT_PUBLISHABLE**
- Counts: exp 5, cap 4, BOM 4, rules 5, autos 2, content 4, addons 5

| Fact area | Source | Planned target | Count | Status | Issues |
| --- | --- | --- | --- | --- | --- |
| identity | 04_Product_Master | products | 1 | OK |  |
| name | 04_Product_Master | canonical_name | 1 | OK |  |
| kind | DEC-008 | productKind | 1 | OK |  |
| commercial_role | DEC-008 | commercialRole | 1 | OK |  |
| hero/subtitle/story | 14_Content_Library | content_entries | 3 | PARTIAL | A4 verbatim story may differ (DEC-012) |
| customer_experiences | 05_Product_Experiences | experiences | 5 | OK |  |
| capabilities | 06_Product_Capabilities | capabilities | 4 | OK |  |
| BOM | 07_Product_BOM | bom_items | 4 | OK |  |
| automation | 19_Automation_Library+deltas | automations | 2 | OK |  |
| dependencies | 09_Product_Rules | rules | 5 | OK |  |
| Expand Further | A4 / DEC-010 | relationships | 0 | MISSING | No structured relationship rows in ImportPlan |
| Add-ons | 11_Add_Ons | addon eligibility | 5 | OK |  |
| price | 10_Pricing_Summary | product_prices | 1 | OK |  |
| theme | 17_Theme_Library | themes | 1 | OK |  |
| images | 16_Image_Library | assets | 1 | NOT_PUBLISHABLE |  |
| A4 presentation | DEC-009/012 | presentation_map | 0 | MISSING | Structured A4 map not in plan |
| version | DEC-005 | product_os_release | 1 | OK |  |
| publish_eligibility | gates | publish | 0 | BLOCKED | Assets + A4 content gaps |
| Protection host | DEC-013 | included_benefit host | 1 | OK |  |

## E-06 — Smart Toilet

- Actual name: Smart Toilet
- Kind / role: STANDALONE / STANDARD
- Import readiness: **IMPORTABLE_BUT_NOT_PUBLISHABLE**
- Publish readiness: **NOT_PUBLISHABLE**
- Counts: exp 4, cap 1, BOM 1, rules 3, autos 0, content 4, addons 0

| Fact area | Source | Planned target | Count | Status | Issues |
| --- | --- | --- | --- | --- | --- |
| identity | 04_Product_Master | products | 1 | OK |  |
| name | 04_Product_Master | canonical_name | 1 | OK |  |
| kind | DEC-008 | productKind | 1 | OK |  |
| commercial_role | DEC-008 | commercialRole | 1 | OK |  |
| hero/subtitle/story | 14_Content_Library | content_entries | 3 | PARTIAL | A4 verbatim story may differ (DEC-012) |
| customer_experiences | 05_Product_Experiences | experiences | 4 | OK |  |
| capabilities | 06_Product_Capabilities | capabilities | 1 | OK |  |
| BOM | 07_Product_BOM | bom_items | 1 | OK |  |
| automation | 19_Automation_Library+deltas | automations | 0 | OK |  |
| dependencies | 09_Product_Rules | rules | 3 | OK |  |
| Expand Further | A4 / DEC-010 | relationships | 0 | MISSING | No structured relationship rows in ImportPlan |
| Add-ons | 11_Add_Ons | addon eligibility | 0 | OK |  |
| price | 10_Pricing_Summary | product_prices | 1 | OK |  |
| theme | 17_Theme_Library | themes | 1 | OK |  |
| images | 16_Image_Library | assets | 1 | NOT_PUBLISHABLE |  |
| A4 presentation | DEC-009/012 | presentation_map | 0 | MISSING | Structured A4 map not in plan |
| version | DEC-005 | product_os_release | 1 | OK |  |
| publish_eligibility | gates | publish | 0 | BLOCKED | Assets + A4 content gaps |
| supply-only | DEC-011 | fulfillmentMode | 1 | OK |  |


## Protection Bonus (benefit)

- Code: `benefit.protection_bonus`
- Host: E-05 CCTV
- Unlock: C-01 ∧ C-06 ∧ E-05
- Purchasable / priced / A4 / Add to My Home: **No**
