# Phase 5A — Shared Product Read Model

## Status

**Completed on 2026-07-19.** A single read-only Product projection now serves the
Website, Configurator, Quote and A4 Print boundaries.

## Components

- `product-read-repository.js` is the only V2 database query boundary.
- `product-read-service.js` assembles customer content, Experience presentation,
  scope presentation, capabilities, relationships, Add-ons, price, theme, layout,
  image approval and included benefits.
- `product-read-model.js` remains the shared output contract and print gate.
- `selection-quote.js` calculates selection totals from the same active prices.

No consumer should query `pos2_*` directly or maintain its own product facts.

## Neon DEV acceptance

Living C-02 resolved from Product OS with:

- 5 customer Experience presentations
- 5 standard-scope presentation groups
- 7 included capabilities
- 7 permitted Add-ons, all 7 with active prices
- installed customer price: $2,999 incl. GST

CCTV E-05 resolved with:

- installed customer price: $3,999 incl. GST
- Protection Bonus unlocked only when C-01 + C-06 + E-05 are selected
- quote value for the Bonus: $0

The non-Add-on catalogue contains 13 products. The unified price book contains
45 prices: 13 core products and 32 Add-ons.

## Publication and print gate

Product data is readable in DEV, but formal print remains false while the linked
Hero asset is `NOT_APPROVED_FOR_PUBLISH`. This is intentional and prevents a
placeholder image being published merely because product facts are complete.

## Product Studio decision

The existing Product Studio Living page uses an older hard-coded template and copy.
It must not be silently adapted because that would mix Legacy presentation with the
approved A4 Product Language. Phase 5B should add a new database-driven Product Sheet
route using the approved shared read model, then retire the old hard-coded data after
visual comparison and approval.
