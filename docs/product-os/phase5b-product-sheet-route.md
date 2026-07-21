# Phase 5B — Database-driven Product Sheet Route

## Status

**DEV implementation completed on 2026-07-19.**

Route: `/product/[code]` in Product Studio, for example `/product/C-02`.

## Data contract

The route obtains all product facts and approved customer copy through the Phase 5A
shared Product Read Model. It does not import the old hard-coded `living.ts` data.

The same model supplies:

- front-side Hero, Subtitle, Story and Moments;
- back-side Problem, Response, Experiences and Standard Scope;
- Expand Further relationships;
- A4 Featured Add-ons and their unified prices;
- installation assumptions and active installed price;
- Product OS hierarchy and release version.

Configurator may show all permitted Add-ons. A4 shows only `featuredAddons`, preserving
the approved presentation mapping and avoiding accidental database-order selection.

## Print and publication safety

The print button is disabled while the linked Hero asset is not approved. The six
Collection Hero assets are now approved in Neon DEV, so C-01 through C-06 are
print-enabled. Non-approved products still fail closed and show the DEV placeholder.

## Visual acceptance

Living C-02 was checked in the browser at A4 proportions:

- two A4 portrait pages;
- larger readable body type while retaining the quiet visual hierarchy;
- no clipped headings or content cards;
- installation assumptions and footer separated;
- correct Featured Add-ons: Automated Curtain, Warm Ambient Zone, Compatible
  Split-System Control;
- price and scope sourced from Neon DEV.

## Hero asset resolution

The six approved Collection hero images were recovered as derivatives of the frozen
A4 Review Set, registered with source provenance and immutable SHA-256 hashes, and
stored under `public/assets/product-os/<product-code>/`.

The original photography files are still desirable for future high-resolution web
and campaign use, but their absence no longer blocks internal A4 printing. Production
publication remains a separate release decision.
