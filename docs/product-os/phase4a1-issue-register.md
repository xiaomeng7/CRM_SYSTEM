# Phase 4A.1 — Issue Register

| Issue ID | Source | Fact | Action | Reason | Severity | Owner decision | Publish impact |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4A1-001 | A4_Content_Mapping_Review_V1.md / 14_Content_Library | Approved A4 customer copy (moments/problem/response/story verbatim) | BLOCK_PUBLISH | Content Library only Hero/Subtitle/Story/Footer; DEC-012 not fully materialised | P1_PUBLISH_BLOCKER | DEC-012 | A4 / Website narrative publish blocked |
| 4A1-002 | DEC-010 / A4 Expand Further | Typed product relationships | BLOCK_PUBLISH | No Expand Further rows in ImportPlan (transform gap / missing structured extraction) | P0_IMPORT_BLOCKER | DEC-010 | Configurator cross-sell + A4 Expand Further incomplete for DEV catalogue graph |
| 4A1-003 | 16_Image_Library | Approved hero originals | GATE_ASSET | Generic placeholder paths; DEC-007 NOT_APPROVED_FOR_PUBLISH | P1_PUBLISH_BLOCKER | DEC-007 / ISSUE-007 | All product pages not publishable |
| 4A1-004 | ISSUE-014 | Featured Add-on order | DEFER | Eligibility present; featured sort missing | P2_REVIEW | ISSUE-014 | A4 featured Add-ons sequence |
| 4A1-005 | ISSUE-012 / DEC-011 | Structured Exact/From/Contact display modes | PARTIAL | Policy fields set; full display-mode authority NEEDS_SOURCE | P2_REVIEW | DEC-011 | Price line qualifiers |
| 4A1-006 | 12_Product_Card_Content | Legacy card content rows | SKIP | LEGACY_NON_AUTHORITATIVE — intentional | INFO_INTENTIONAL | DEC-012 | None if 14 used |
| 4A1-007 | 13_Roadmap | Roadmap rows | SKIP | INTENTIONALLY_SKIPPED_ROADMAP | INFO_INTENTIONAL |  | None |
| 4A1-008 | DEC-010/012 | Decision application incomplete | GATE_FAIL | Not all DEC-001…012 fully applied as importable facts | P0_IMPORT_BLOCKER | PO review | Phase 4B not approved under gate rules |
| 4A1-009 | 10_Pricing_Summary E-05 | Protection price row | SKIP_PRICE | PROTECTION_NOT_PRICED | INFO_INTENTIONAL | DEC-013 | None |

## Gate thresholds

| Check | Required | Actual |
|---|---|---|
| P0 | 0 | 2 |
| Silent skips | 0 | 0 |
| Orphan Add-ons | 0 | 0 |
| Duplicate product codes | 0 | 0 |
