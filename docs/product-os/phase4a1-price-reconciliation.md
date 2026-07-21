# Phase 4A.1 — Price Reconciliation

Authority: `10_Pricing_Summary` (customer price only). Internal material/labour/GP **redacted**.

| Target | Source | Display mode | Amount | Currency | Tax | Fulfilment | Installation | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F-01 | 10_Pricing_Summary | EXACT | 4999 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| C-01 | 10_Pricing_Summary | EXACT | 2499 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| C-02 | 10_Pricing_Summary | EXACT | 2999 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| C-03 | 10_Pricing_Summary | EXACT | 2499 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| C-04 | 10_Pricing_Summary | EXACT | 2699 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| C-05 | 10_Pricing_Summary | EXACT | 2199 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| C-06 | 10_Pricing_Summary | EXACT | 1499 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| E-01 | 10_Pricing_Summary | EXACT | 1499 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| E-02 | 10_Pricing_Summary | EXACT | 2699 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| E-03 | 10_Pricing_Summary | EXACT | 2999 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| E-04 | 10_Pricing_Summary | EXACT | 2999 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| E-05 | 10_Pricing_Summary | FROM | 3999 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| E-06 | 10_Pricing_Summary | EXACT | 3299 | AUD | GST_INCLUSIVE | SUPPLY_ONLY | false | PLANNED |

## Add-on prices

| Target | Source | Display mode | Amount | Currency | Tax | Fulfilment | Installation | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AO-001 | 11_Add_Ons | EXACT | 299 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-002 | 11_Add_Ons | EXACT | 299 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-003 | 11_Add_Ons | EXACT | 499 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-004 | 11_Add_Ons | EXACT | 499 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-005 | 11_Add_Ons | EXACT | 799 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-006 | 11_Add_Ons | EXACT | 499 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-007 | 11_Add_Ons | EXACT | 449 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-008 | 11_Add_Ons | EXACT | 349 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-009 | 11_Add_Ons | EXACT | 299 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-010 | 11_Add_Ons | EXACT | 249 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-011 | 11_Add_Ons | EXACT | 69 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-012 | 11_Add_Ons | EXACT | 199 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-013 | 11_Add_Ons | EXACT | 599 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-014 | 11_Add_Ons | EXACT | 149 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-015 | 11_Add_Ons | EXACT | 199 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-016 | 11_Add_Ons | EXACT | 199 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-017 | 11_Add_Ons | EXACT | 199 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-018 | 11_Add_Ons | EXACT | 149 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-019 | 11_Add_Ons | EXACT | 1299 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-020 | 11_Add_Ons | EXACT | 99 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-021 | 11_Add_Ons | EXACT | 699 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-022 | 11_Add_Ons | EXACT | 799 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-023 | 11_Add_Ons | EXACT | 99 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-024 | 11_Add_Ons | EXACT | 599 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-025 | 11_Add_Ons | EXACT | 899 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-026 | 11_Add_Ons | EXACT | 799 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-027 | 11_Add_Ons | EXACT | 1499 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-028 | 11_Add_Ons | EXACT | 1999 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-029 | 11_Add_Ons | EXACT | 499 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-030 | 11_Add_Ons | EXACT | 599 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-031 | 11_Add_Ons | EXACT | 599 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |
| AO-032 | 11_Add_Ons | EXACT | 99 | AUD | GST_INCLUSIVE | INSTALLED | true | PLANNED |

## Checks

- Protection: no price row (SKIP_PRICE) — OK
- Collections: INSTALLED + GST inclusive — OK
- Smart Toilet E-06: SUPPLY_ONLY — OK
- Currency AUD — OK
- No internal costs on plan surface — OK
