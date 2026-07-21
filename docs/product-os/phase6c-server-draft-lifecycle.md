# Phase 6C — Server Draft Persistence and Lifecycle Foundation

## Status

**DEV schema and implementation completed on 2026-07-19.**

Migration `20260719160000_add_sales_drafts` was applied only to the approved Neon DEV
branch with fingerprint:

`sha256:2dec7eeaf2d657af6298f033bd35c73cab44a1388ff01455859d839516251fec`

Production was not connected or changed. All four new tables were verified empty
immediately after deployment.

## New lifecycle model

- `pos2_selection_drafts` — stable customer selection identity and current version.
- `pos2_selection_draft_versions` — immutable priced snapshots.
- `pos2_selection_draft_lines` — canonical product links plus name/code/price snapshots.
- `pos2_proposals` — proposal lifecycle and frozen projection snapshot.

Draft statuses are DRAFT, READY_FOR_REVIEW, CONVERTED and ARCHIVED. Proposal statuses
are DRAFT, INTERNAL_REVIEW, APPROVED, SENT, ACCEPTED, DECLINED, EXPIRED and CANCELLED.

Database checks prevent invalid quantities, negative totals, inconsistent line totals,
approval without approver/time, and sent states without a sent timestamp.

## Version and audit behaviour

Saving a changed selection creates the next immutable draft version and an audit-log
entry. Saving the same selection fingerprint returns the existing version without
creating noise. Product IDs remain linked while commercial names, codes and prices
are snapshotted for historical accuracy.

## Write safety

The server save endpoint is fail-closed. It returns
`DEV_DRAFT_WRITES_DISABLED` unless the runtime explicitly sets
`PRODUCT_STUDIO_ALLOW_DEV_DRAFT_WRITES=true`.

This flag is not a substitute for user authentication. It is only a controlled DEV
gate. Production enablement is prohibited until user identity, roles and customer
record ownership are implemented.

CRM, Contract and ServiceM8 side effects remain absent.

## Validation

- Prisma schema validate and client generation: passing.
- Product OS V2 tests: 82/82 passing.
- Product Studio production build: passing.
- Migration safety scan: passing.
- Neon DEV migration: applied successfully.
- New table row counts after migration: 0 / 0 / 0 / 0.

## Next phase

Phase 6D should introduce authenticated sales users and roles, then enable DEV draft
writes for those users. Customer matching should prefer an explicit CRM contact ID;
email or phone matching must never silently merge customers.
