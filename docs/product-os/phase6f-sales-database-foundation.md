# Phase 6F — Sales Database Foundation

## Status

**Neon DEV database foundation completed on 2026-07-19.**

Migration `20260719190000_add_sales_users_customer_links` was applied only to the
approved Product OS DEV branch. Production was not connected or changed.

## Sales users

`pos2_sales_users` is now the stable internal identity directory for Sales Studio. It
stores email, display name, role, lifecycle status, future authentication provider and
future provider subject. It does not store passwords.

The initial DEV administrator is:

- email: `meng.z@bhtechnology.com.au`
- role: ADMIN
- status: ACTIVE
- authentication provider: DEV_PENDING

No other Sales Studio user exists.

## Draft ownership and audit

Drafts now carry an owner user foreign key. Every immutable Draft version can carry
the authenticated actor user foreign key. Proposal approval can reference the
approving user rather than relying only on free text.

The historical string fields remain as readable snapshots, while user foreign keys
provide referential integrity.

## CRM customer boundary

`pos2_draft_customer_links` stores only the relationship between a Product OS Draft
and a CRM contact. It does not duplicate the CRM customer record.

The relationship supports pending review, confirmed and rejected states plus the
matching method and candidate snapshot. Database constraints prevent a confirmed link
without a CRM contact reference, confirming user and confirmation time.

There is intentionally no cross-database foreign key to the CRM contacts table. CRM
contact existence must be verified through the CRM service before confirmation.

## Validation

- Prisma schema and client generation: passing.
- Product OS tests: 90/90 passing before DEV registration.
- Migration safety: additive; no DROP statements.
- Neon DEV migration: applied successfully.
- Sales users: exactly one ACTIVE ADMIN.
- Customer links, Drafts and Proposals: all zero after setup.
- Production connections or changes: none.

## Next work order

1. Build the single-admin Sales Studio shell and Draft list against this database.
2. Keep authentication provider status pending until the operational account provider
   is chosen.
3. Review the current public homepage against Better Home's evolved company strategy.
4. Convert that review into a separate approved website roadmap before redesigning the
   homepage.
