# Phase 6H — Draft detail and resume

Status: Completed for Neon DEV

## Outcome

Sales Studio now treats a Draft as a reopenable sales work object rather than only a dashboard row.

New route:

- `/sales/drafts/[draftCode]`

The detail view includes:

- customer and site summary;
- CRM-link review status;
- Draft owner and last update;
- latest selected products, quantities and price snapshots;
- indicative total and tax basis;
- Draft version history;
- associated Proposal summaries when present;
- a deliberate `Continue editing` path back to the configurator.

The dashboard links each populated Draft row to its detail page.

## Resume behaviour

`/configure?draft=[draftCode]` restores the latest server-side Draft version into the configurator:

- product and Add-on selections;
- quantities;
- customer details;
- existing Draft code.

The server Draft takes precedence over the browser-local Draft when an authorised resume request is present. Saving a changed selection creates the next immutable Draft version through the existing service. An unchanged projection remains idempotent.

## Access boundary

- Draft detail and resume require the controlled Sales Studio actor.
- SALES can read only Drafts owned by the same external subject.
- MANAGER and ADMIN follow the existing all-Draft permission policy.
- Invalid and unknown Draft codes fail closed.
- Production single-admin access remains disabled by default.

## Data and side effects

- Reads: Neon DEV Product OS V2 only.
- Database schema change: none.
- Fact import: none.
- Test customer or Draft creation: none.
- CRM / ServiceM8 / contract side effects: none.
- Production connection or change: none.

## Verification

- Product OS V2 tests: 94/94 passed.
- Added tests for latest-version projection and cross-owner denial.
- Product Studio production build: passed.
- Dynamic routes confirmed: `/sales`, `/sales/drafts/[draftCode]`, `/configure`.

The DEV database currently contains no Drafts, so no fake customer record was inserted for visual demonstration. The real empty state remains the truthful operational state.

## Engineering correction

The Product OS migration safety utility already depended on PostgreSQL's `pg` driver but the dependency was previously undeclared. `pg` is now a direct Product OS dependency so clean installs reproduce the tested environment.

## Next product step

Introduce a controlled status transition from Draft to `READY_FOR_REVIEW`, then create a Proposal record from a specific immutable Draft version. Proposal approval and sending should remain separate actions.
