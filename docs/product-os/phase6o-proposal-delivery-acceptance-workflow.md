# Phase 6O — Proposal delivery and acceptance workflow

Status: Implemented for Neon DEV

## Outcome

The Proposal workspace now supports two deliberate internal records:

1. Record delivery of an approved Proposal, including channel, recipient and evidence reference.
2. Record customer acceptance of the sent Proposal, including method, customer name and evidence reference.

Recording delivery does not send an email. Recording acceptance does not call ServiceM8. Acceptance locks the Proposal fingerprint, amount and currency and creates one idempotent `PENDING` operational handoff.

## Permissions and gates

- Delivery recording: ADMIN (`PROPOSAL_SEND`).
- Acceptance recording: MANAGER or ADMIN (`PROPOSAL_ACCEPT_RECORD`).
- Proposal must move through `APPROVED → SENT → ACCEPTED`.
- Acceptance requires a complete confirmed CRM Contact, Account, Property and Better Home Opportunity context.
- Repeated successful actions are idempotent.

## External boundary

- CRM reads only; no CRM mutation.
- No outbound customer message.
- No ServiceM8 API call or Work Order creation.
- No Product OS Invoice.
- Production remains disabled.

## Verification

- Product OS V2 tests: 108/108 passed.
- Product Studio production build passed.
- Protected delivery and acceptance routes are included in the build.
- No customer, Proposal event or handoff test record was written to Neon DEV.

## Next step

Build the controlled ServiceM8 handoff worker in dry-run mode first. It must resolve or create the ServiceM8 Company through the existing `external_links` path, preview the Work Order payload, and prove idempotency before live DEV creation is enabled.
