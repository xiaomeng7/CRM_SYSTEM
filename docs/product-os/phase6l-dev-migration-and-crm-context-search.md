# Phase 6L — DEV migration and CRM context search

Status: Completed on Neon DEV

Date: 2026-07-20

## Database target

- Environment: `neon_dev`
- Branch: `product-os-v2-dev`
- Sanitized fingerprint: `sha256:2dec7eeaf2d657af6298f033bd35c73cab44a1388ff01455859d839516251fec`
- Production connections or changes: none

## Applied migrations

1. Product OS `20260720120000_add_crm_sales_context_links`
2. CRM `082_better_home_commercial_channel.sql`

Product OS migration status reports all six migrations applied. CRM verification confirms both Opportunity columns are present:

- `asset_id`
- `commercial_channel`

No existing Opportunity was reclassified. Current eligible `BETTER_HOME_PROPOSAL` Opportunity count is zero, which is the correct non-destructive result.

## Sales Studio capability

Draft detail now includes a read-only CRM Context search. It:

- requires access to the Draft;
- searches joined CRM Opportunity, Account, Contact and Asset data;
- returns only Opportunities whose commercial channel is `BETTER_HOME_PROPOSAL`;
- reports missing Contact, Account or Property context;
- does not create, update or auto-link a CRM record;
- does not use the legacy `customers` table.

If CRM has no eligible Opportunity, the interface directs the user to prepare it in CRM first. This preserves CRM ownership instead of allowing Product OS to repair CRM data implicitly.

## Verification

- Prisma schema/client generation: passed.
- Product OS V2 tests: 100/100 passed.
- Product Studio production build: passed.
- CRM migration read-only verification: passed.
- Production writes: none.
- ServiceM8 calls: none.

## Next step

Build the deliberate confirmation action that links one complete eligible CRM context to a Draft. Confirmation must re-read the Opportunity inside the write transaction, verify the four IDs still belong together and keep the `BETTER_HOME_PROPOSAL` channel requirement. It must not modify CRM.
