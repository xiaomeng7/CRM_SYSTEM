# Phase 6A — Configurator and Indicative Quote UI

## Status

**DEV implementation completed on 2026-07-19.**

Route: `/configure` in Product Studio.

## Product flow

The customer-facing sequence now follows the approved Product Language:

1. Foundation
2. Collections
3. Experiences
4. Standalone products
5. Permitted Add-ons
6. Indicative installed total

Selecting a Collection or Experience that requires Foundation adds Foundation
automatically. Removing Foundation also removes dependent selections. Standalone
products do not require Foundation.

## Add-on boundary

The Configurator does not display the complete Add-on catalog. It derives the visible
Add-ons from the selected parent products' `permittedAddons` relationships.

If a parent is removed, any Add-on no longer permitted by another selected parent is
removed from the effective selection. This preserves the frozen rule that an Add-on
extends an existing capability and cannot create a new room or Experience.

## Pricing

The indicative quote uses the active customer prices already assembled by the shared
Product Read Model. Product and Add-on quantities are supported. The total is labelled
as an early selection rather than a formal proposal, and retains the installed/GST
scope note.

## Shared system boundary

- Product pages and A4 print continue to use `/product/[code]`.
- Product pages link directly to the Configurator.
- The Configurator uses the same Product OS read service as A4 and Website surfaces.
- No duplicate price, Add-on or content source was introduced.
- No Production database or schema change was made.

## Validation

- Product Studio production build: passing.
- Product OS V2 test suite: 78/78 passing.

## Next phase

Phase 6B should persist a draft selection and generate a formal Proposal projection.
That projection should become the shared hand-off contract for CRM, contract creation
and ServiceM8 job creation; those external side effects must remain separately
approved.
