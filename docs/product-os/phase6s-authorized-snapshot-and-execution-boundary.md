# Phase 6S — Authorized snapshot and execution boundary

Status: Completed on Neon DEV

## Outcome

Administrator authorization now stores both the deterministic hash and the complete reviewed Work Order payload. Before any ServiceM8 call, the CRM worker re-reads and compares:

- accepted Proposal fingerprint;
- CRM Opportunity, Account, Contact and Property IDs;
- Better Home commercial channel;
- current installation address;
- authorized Work Order description.

Any change stops execution and requires a new preview and authorization.

## Internal execution boundary

The CRM app exposes a fail-closed internal handoff endpoint protected by a dedicated timing-safe secret and both DEV execution gates. Product Studio has a server-side proxy protected by Sales Studio ADMIN permission and its own explicit proxy gate.

There is no browser-visible execution button yet. Configuration and a final end-to-end DEV review must occur before presenting that action.

## Safety

- Missing secrets deny access; there is no permissive fallback.
- The ServiceM8 key is never sent to Product Studio or the browser.
- Production mode is rejected by the worker.
- No scheduler invokes the endpoint.

## Verification

- Product OS V2 tests: 115/115 passed.
- CRM worker and internal route load tests passed with no external adapter.
- Product Studio production build passed, including the disabled server-side execution proxy.
- Neon DEV migration history: 9 applied migrations.
- Operational handoffs: 0; authorized snapshots: 0.
- ServiceM8 calls: none.
- Production connection or change: none.
