# Phase 6K — CRM / Proposal / ServiceM8 boundary reconciliation

Status: Design and migration artifacts completed; database application pending

Date: 2026-07-20

## Audit result

The repository already contains more ServiceM8 integration infrastructure than the initial Product OS boundary assumed:

- ServiceM8 Company → CRM Account mapping through `external_links`;
- idempotent company lookup/create via `ensureServiceM8LinkForAccount`;
- inbound company, contact, job, quote, invoice and job-material sync;
- CRM Opportunity links to operational Job and financial mirrors;
- final Invoice and cashflow views based on ServiceM8 data.

No second external-identity mechanism is required for the Better Home workflow. The active `external_links` path should be reused.

## Resolved policy conflict

The earlier CRM policy made ServiceM8 the quote owner for every Opportunity. ADR-012 narrows that statement:

- conventional electrical/service Opportunity → `SERVICEM8_QUOTE`;
- Better Home product Opportunity → `BETTER_HOME_PROPOSAL`.

Both converge into ServiceM8 after acceptance for Work Order, execution and final Invoice.

## Artifacts

- `docs/adr/ADR-012-better-home-commercial-system-boundaries.md`
- `docs/product-os/crm-proposal-servicem8-mapping.md`
- scope clarification in `docs/crm-servicem8-opportunity-flow.md`
- CRM migration draft `082_better_home_commercial_channel.sql`
- Product OS migration `20260720120000_add_crm_sales_context_links`

## Model additions

CRM Opportunity:

- `asset_id` — installation property;
- `commercial_channel` — one of `SERVICEM8_QUOTE` or `BETTER_HOME_PROPOSAL`.

Product OS Draft customer link:

- CRM Contact ID;
- CRM Account ID;
- CRM Asset ID;
- CRM Opportunity ID.

These remain logical boundary references rather than cross-domain foreign keys. CRM owns validation and Product OS owns the immutable customer/commercial snapshot.

## Verification

- Prisma schema: valid using a non-connectable validation URL.
- Product OS V2 tests: 99/99 passed.
- Product Studio production build: passed.
- New migrations are additive and contain no destructive statement.
- Database connections: none.
- Database writes: none.
- Production changes: none.

## Next controlled step

Review and apply both additive migrations to the Neon DEV branch, then implement a read-only CRM-context resolver for Sales Studio. The resolver should select Account, Contact, Asset and Opportunity together and confirm that the Opportunity commercial channel is `BETTER_HOME_PROPOSAL` before linking the Draft.
