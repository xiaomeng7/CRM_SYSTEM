# Legacy ID Crosswalk (DEC-013 / ADR-012)

- Date: 2026-07-18
- Status: Approved for import planning — **not yet applied to data**
- Tables: `pos2_product_aliases`, `pos2_included_benefits`

## Canonical identifiers (V2)

| Code | Name | Kind | Role |
|---|---|---|---|
| E-05 | CCTV | EXPERIENCE | PACK |
| E-06 | Smart Toilet | STANDALONE | STANDARD |

**No canonical E-07.**  
**No Protection Bonus product code.**

## Legacy workbook mapping (V2.07)

| Legacy code | Legacy label | Resolution | Canonical / benefit |
|---|---|---|---|
| E-05 | Protection Bonus | `INCLUDED_BENEFIT` | `benefit.protection_bonus` on host **E-05 CCTV** |
| E-06 | CCTV | `PRODUCT` | **E-05** |
| E-07 | Smart Toilet | `PRODUCT` | **E-06** |

`alias_system` = `V2_07_WORKBOOK` (and additional systems as needed).

## Importer transforms (Phase 4/5 — planned)

1. Read workbook Product ID / Name.
2. If Legacy E-05 Protection → create/update `pos2_included_benefits` + alias row; **do not** insert `pos2_products`.
3. If Legacy E-06 CCTV → insert/update product as **E-05**; write alias `E-06` → product E-05.
4. If Legacy E-07 Smart Toilet → insert/update as **E-06**; write alias `E-07` → product E-06.
5. Remap all FK-like workbook references (BOM, capabilities, Expand Further, prices) through the same crosswalk.
6. Preserve Legacy codes only in aliases/provenance — never overwrite historical source snapshots.

## Protection unlock (post-renumber)

`C-01` Entry **AND** `C-06` Away **AND** `E-05` CCTV → Protection Bonus included on CCTV.

## Code

- `packages/product-os/src/v2/legacy-crosswalk.js`
