# Phase 6Q — DEV-only ServiceM8 handoff worker

Status: Implemented; live entry point disabled

## Outcome

The operational handoff now has a worker that can claim one accepted Proposal handoff, request one ServiceM8 `Work Order` through the existing CRM job-creation service, and mark the handoff completed with the returned ServiceM8 Job UUID.

The conventional CRM path remains unchanged and defaults to `Quote`. Only the Better Home accepted-Proposal path explicitly requests `Work Order`.

## Idempotency and recovery

- Completed handoffs return the existing Job UUID.
- Atomic status claim prevents concurrent workers from processing one handoff.
- Existing Opportunity Job links are reused by the CRM job-creation service.
- A failed call records a bounded error and can be retried.
- If a ServiceM8 Job UUID exists after a partial failure, automated retry stops for manual reconciliation rather than risking duplication.

## Enablement gates

Execution requires both:

- `PRODUCT_OS_DATABASE_ENV=neon_dev`
- `BETTER_HOME_SERVICEM8_HANDOFF_ENABLED=ENABLE_DEV_BETTER_HOME_HANDOFF`

No API route, UI button or scheduled runner invokes live execution. The worker defaults to dry run.

## Verification boundary

Unit verification uses an injected fake job creator. No ServiceM8 API call is made and no Neon record is changed.

- Worker unit test passed for dry run, disabled execution and simulated successful completion.
- Product OS V2 tests: 111/111 passed.
- Product Studio production build passed.
- Live worker remains unavailable from API, UI and scheduler.
