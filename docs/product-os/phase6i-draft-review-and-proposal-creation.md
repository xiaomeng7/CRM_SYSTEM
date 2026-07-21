# Phase 6I — Draft review gate and Proposal creation

Status: Completed for Neon DEV implementation

## Outcome

The sales lifecycle now has an explicit decision boundary:

`DRAFT → READY_FOR_REVIEW → CONVERTED`

A Proposal is created from one immutable current Draft version. Its product lines, customer snapshot, prices, total, tax basis and selection fingerprint are copied into a Proposal projection snapshot. Later edits to a selection cannot silently alter that Proposal.

## Actions

From the Draft detail page:

- `Mark ready for review` moves a valid versioned Draft from `DRAFT` to `READY_FOR_REVIEW`.
- `Create Proposal` is available only from `READY_FOR_REVIEW`.
- Proposal creation converts the source Draft to `CONVERTED`.
- Repeating either successful request is idempotent where appropriate.

Creating a Proposal does not approve, send, contract or schedule it.

## Permissions

- SALES may prepare and mark an owned Draft ready.
- MANAGER and ADMIN may review and create the Proposal.
- SALES cannot create a Proposal.
- All access continues to fail closed without an active registered Sales Studio user.

## Auditability

Both lifecycle actions create Product OS audit records:

- `SELECTION_DRAFT_READY_FOR_REVIEW`
- `PROPOSAL_CREATED_FROM_DRAFT_VERSION`

Proposal codes are deterministic for a specific Draft code and version, preventing duplicate Proposals from repeated requests.

## Safety boundary

- Implemented for Neon DEV only.
- User action is required for every write.
- No test Draft or Proposal was inserted.
- No Production connection or change.
- No CRM, ServiceM8, email, contract or payment side effect.
- Proposal approval and sending remain separate future actions.

## Verification

- Product OS V2 tests: 97/97 passed.
- Permission, stable Proposal code and idempotent readiness tests passed.
- Product Studio production build passed.
- Protected API routes included in build:
  - `/api/drafts/[draftCode]/ready`
  - `/api/drafts/[draftCode]/proposals`

## Next product step

Build the Proposal detail/review screen. It should present the fixed commercial snapshot, highlight customer-link and scope readiness, and provide an ADMIN/MANAGER approval action. Sending must remain disabled until a real login/session and outbound delivery policy are approved.
