# Phase 6B — Draft Selection and Proposal Projection

## Status

**DEV implementation completed on 2026-07-19.**

## Draft selection

The Configurator can now save and restore a versioned draft on the current device.
The draft contains customer contact fields, selected product codes and quantities. It
does not write to Neon or create a CRM record.

## Server-authoritative proposal preview

`POST /api/proposals/preview` accepts customer details and requested product lines,
then independently:

1. reloads every product from Product OS;
2. rejects unknown products;
3. verifies each Add-on has an eligible selected parent;
4. verifies Foundation requirements;
5. recalculates active prices and totals; and
6. produces the versioned Proposal Projection.

The browser total is therefore presentational and cannot become a proposal fact
without server-side revalidation.

## Proposal Projection 1.0.0

The projection contains:

- deterministic draft proposal ID and selection fingerprint;
- customer and site fields;
- canonical product codes, quantities, unit prices and line totals;
- currency and tax basis;
- indicative total and commercial notice;
- explicit downstream states for CRM, Contract and ServiceM8.

The generated JSON can be downloaded for inspection. External states are fixed to
`NOT_SENT` or `NOT_CREATED`; this phase has no external side effects.

## Validation

- Product OS V2 tests: 80/80 passing.
- Product Studio production build: passing.
- Proposal ID/fingerprint determinism: covered by automated tests.
- Invalid quote rejection: covered by automated tests.

## Release boundary and next phase

No Production database, CRM, contract or ServiceM8 change was made.

Phase 6C should add server-side draft persistence and lifecycle states. Before any
external hand-off is enabled, it needs an explicit Product Owner decision covering
customer identity matching, user permissions, audit history and approval to create
records in CRM or ServiceM8.
