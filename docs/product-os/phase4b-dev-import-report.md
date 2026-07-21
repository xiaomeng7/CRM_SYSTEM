# Phase 4B — Neon DEV Import Report

## Status

**Completed on 2026-07-19.** Product OS V2.07 facts were imported into the isolated
`product-os-v2-dev` Neon branch. Production was not connected or changed.

## Safety sequence

1. Added the equipment/capability basis model required by approved Add-on semantics.
2. Applied migration `20260719120000_addon_profile_basis_integrity` to Neon DEV only.
3. Ran the complete import in one transaction and deliberately rolled it back.
4. Re-ran the identical plan in APPLY mode after the rollback rehearsal passed.
5. Performed a read-only acceptance inventory.

Target fingerprint:
`sha256:2dec7eeaf2d657af6298f033bd35c73cab44a1388ff01455859d839516251fec`

Import plan SHA-256:
`0f56b58578a4334ee280c057dd89968cfb12912aabe124bf2bc4ff2bde13782f`

## Imported acceptance inventory

| Item | Count |
|---|---:|
| Purchasable product nodes (13 core + 32 Add-ons) | 45 |
| Add-on profiles | 32 |
| Add-on equipment-basis links | 28 |
| Add-on parent eligibilities | 48 |
| Customer prices (13 core + 32 Add-ons) | 45 |
| Content entries | 214 |
| Product content placements | 214 |
| Product Experience facts | 45 |
| A4-to-Experience mappings with factual Experience IDs | 10 |
| Included Protection benefits | 1 |
| Assets held behind publish approval | 13 |

Twenty approved A4 experience expressions without Experience Library IDs are stored
as customer content placements, not invented as Experience facts. A4 scope wording is
also presentation content; Capability and BOM records remain its fact authority.

## Boundary checks

- Canonical E-07 products: **0**
- Protection products: **0**
- `benefit.protection_bonus`: **1**
- Legacy Protection `Visible Deterrence` was not attached as a baseline CCTV Experience.
- Protection unlock remains Entry AND Away AND CCTV (C-01 + C-06 + E-05).
- Approved original hero images are still missing; all 13 asset records remain
  `NOT_APPROVED_FOR_PUBLISH`.

## Explicit confirmations

- Production connections / changes: **None / None**
- CRM schema or data changes: **None**
- V1 seed/import script used for V2: **No**
- Placeholder facts imported: **No**
- Source workbook or approved A4 wording modified: **No**

## Next phase

Phase 5A should build one shared Product read model from `pos2_*` for the sales website,
Configurator, quote calculation and A4 print endpoint. Website and print must consume
the same read model; neither may hard-code product facts or approved copy.
