# Phase 6M — CRM context confirmation

Status: Implemented for Neon DEV

## Outcome

Sales Studio can deliberately link one complete CRM customer context to a Draft. The write transaction re-reads the selected Opportunity and confirms that:

- the commercial channel remains `BETTER_HOME_PROPOSAL`;
- Contact and Property both belong to the Opportunity Account;
- Contact, Account, Property and Opportunity are all present;
- the operator still has write access to the Draft and is an active Sales Studio user.

The confirmed IDs and a point-in-time candidate snapshot are stored in `pos2_draft_customer_links`. An audit event records the decision. Repeating the same confirmation is idempotent; replacing an already confirmed link fails closed.

## Boundary

- CRM is read only.
- Product OS writes only the Draft customer link and audit record.
- No CRM creation or repair.
- No ServiceM8 call, Proposal send, contract, job or Invoice action.
- Production remains untouched.

## Verification

- Product OS V2 tests: 102/102 passed.
- Product Studio production build: passed.
- Protected confirmation route is included in the build.
- No database connection or write was used during implementation verification.

## Next step

Design the accepted-Proposal handoff. It should create or reuse the CRM Opportunity relationship, then deliberately create the ServiceM8 Work Order only after customer acceptance. Proposal delivery and acceptance evidence must be defined before that write integration is enabled.
