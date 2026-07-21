# Phase 6N — Proposal acceptance and ServiceM8 handoff foundation

Status: Completed on Neon DEV

## Commercial lifecycle

`APPROVED → SENT → ACCEPTED → operational handoff → ServiceM8 Work Order`

Internal approval, delivery, customer acceptance and operational creation are separate auditable events. Product OS remains the commercial master for Better Home scope. ServiceM8 becomes the operational master only after acceptance.

## New records

- Proposal delivery: channel, recipient, time, evidence reference and recording user.
- Proposal acceptance: one immutable acceptance per Proposal, accepted fingerprint/total, customer identity, method, evidence reference and recording user.
- Operational handoff: one idempotent request per Proposal containing stable CRM IDs and the eventual ServiceM8 Job UUID.

## Safety boundary

- No email or document was sent.
- No customer acceptance was fabricated.
- No ServiceM8 API call or Work Order was created.
- No CRM record was changed.
- No final Invoice exists in Product OS.
- Migration is additive and has been applied to Neon DEV only.

## Verification

- Prisma schema validation and client generation passed.
- Product OS V2 tests: 105/105 passed.
- Product Studio production build passed.
- Neon DEV migration history: 7 applied migrations.
- New delivery, acceptance and handoff tables exist and contain zero records.
- Production connection or change: none.

## Next controlled step

Apply the additive migration to Neon DEV, then implement internal recording actions for delivery and acceptance. Creating the ServiceM8 Work Order remains a separate, explicitly enabled worker.
