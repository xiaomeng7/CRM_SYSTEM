# Phase 6D — Homepage Entry and Customer Match Policy

## Status

**DEV implementation completed on 2026-07-19.**

## Main website UI

The public website now includes `/better-home`, a customer-facing entry into the
Better Home Product System. The homepage includes a restrained “Explore Better Home”
section linking to it.

The page establishes the journey — choose rooms, add experiences, confirm clearly —
without copying Product OS prices, scopes or Add-on facts into the marketing site.
When `PUBLIC_PRODUCT_STUDIO_URL` is configured, its primary action leads to the live
Configurator. Until then it safely leads to Contact.

Desktop and 390 px mobile layouts were visually checked. No horizontal overflow was
detected. The approved Living Collection image is reused with provenance from the
frozen A4 review set.

## Identity finding

The current CRM does not contain a complete interactive user authentication and role
system. Several internal routes use shared administrative secrets. Those secrets are
not suitable as Sales Studio user identity and were not reused as if they were.

Server-side draft writes therefore remain disabled by default.

## Customer matching policy

The new pure policy establishes:

- an explicit CRM contact ID may be linked after its existence is verified;
- one exact email or normalized phone match is only a suggestion for human review;
- multiple matches require manual review;
- no match requires a reviewed customer-creation decision;
- email or phone similarity never silently merges customer records.

## Validation

- Public website build: passing, including `/better-home`.
- Product OS V2 tests: 85/85 passing.
- Desktop and mobile browser inspection: passing.
- Production deployment: not performed.

## Next phase

Phase 6E should select and implement a real identity provider for Sales Studio, define
SALES, MANAGER and ADMIN permissions, and bind audit actors to authenticated user IDs.
Only after that should DEV draft writes be enabled for interactive use.
