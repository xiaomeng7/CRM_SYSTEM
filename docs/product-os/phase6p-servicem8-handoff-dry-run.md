# Phase 6P — ServiceM8 handoff dry run

Status: Implemented; read-only

## Outcome

An accepted Better Home Proposal can now produce a deterministic ServiceM8 Work Order preview. The preview revalidates the stored CRM Opportunity, Account, Contact and Property relationship, checks the existing `external_links` company mapping and detects an already-linked ServiceM8 Job.

The payload contains only derived operational data: accepted Proposal identity/fingerprint/value, stable CRM IDs, customer/site context, accepted product lines and the handoff idempotency key.

## Fail-closed blockers

- Missing property address.
- Missing ServiceM8 Company mapping (`ENSURE_REQUIRED`).
- CRM relationship or commercial channel changed.

## Safety boundary

- Dry run performs reads only.
- It does not call `ensureServiceM8LinkForAccount`, because that function may create an external Company.
- It does not call ServiceM8.
- It does not change CRM, Product OS handoff state or migration data.
- It does not create a Quote, Job, Invoice or JobMaterial.

## Verification

- Product OS V2 tests: 111/111 passed.
- Product Studio production build passed.
- Read-only handoff preview route is included in the build.
- No Neon DEV, CRM or ServiceM8 write was performed.

## Status policy resolved

An accepted Better Home Proposal creates a ServiceM8 Job with status `Work Order`. It must not create a ServiceM8 Quote. ServiceM8's official Job API lists `Work Order` as a valid Job status; Work Orders and Quotes are represented separately in the Job Diary attachment model.

The DEV worker is implemented with two independent gates: `PRODUCT_OS_DATABASE_ENV=neon_dev` and the exact handoff enable value. It remains unexposed to UI and scheduled execution.
