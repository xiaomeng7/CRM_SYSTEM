# Phase 6J — Proposal review and approval

Status: Completed for Neon DEV implementation

## Outcome

Sales Studio now has a Proposal workspace:

- `/sales/proposals` lists fixed commercial decisions;
- `/sales/proposals/[proposalCode]` shows the immutable Proposal snapshot;
- source Draft and exact version remain visible;
- product lines, quantities, captured prices, tax basis and total are reviewable;
- customer, site, ownership, CRM-link and approval status are visible together.

## Internal lifecycle

`DRAFT → INTERNAL_REVIEW → APPROVED`

- Starting review is an internal action only.
- Approval is limited to MANAGER and ADMIN permissions.
- Approval records the registered approver and timestamp.
- Repeated successful transitions are idempotent where appropriate.
- Every transition creates an audit record.

## Approval gate

A Proposal cannot be approved until the source Draft has a `CONFIRMED` CRM customer link.

This is deliberate. A commercial document should not become approved when Better Home is uncertain which customer record owns it. The current interface does not fabricate or auto-confirm this relationship.

## Delivery boundary

Approval does not:

- email the customer;
- generate a contract;
- collect a deposit;
- create a ServiceM8 job;
- modify the CRM;
- publish anything externally.

The interface explicitly presents an approved Proposal as `Approved — not sent`.

## Safety

- Neon DEV implementation only.
- No test Proposal or customer inserted.
- No Production connection or change.
- Writes require an explicit user action and the DEV write gate.
- Sending remains unavailable.

## Verification

- Product OS V2 tests: 98/98 passed.
- Approval-without-confirmed-customer test passed.
- Product Studio production build passed.
- New dynamic pages and protected routes are included in the build.

## Next product step

Build the customer-link review workflow. It should search the existing CRM without copying customer data into Product OS, present exact and suggested matches, and require a deliberate confirmation before linking. Automatic creation or modification of CRM contacts should remain out of scope until separately approved.
