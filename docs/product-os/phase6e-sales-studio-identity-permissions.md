# Phase 6E — Sales Studio Identity and Permissions Boundary

## Status

**Provider-neutral authorization layer completed on 2026-07-19.**

No identity provider was selected or connected. No login screen was presented as
production-ready.

## Roles

### SALES

- read Product OS catalogue;
- create a Draft;
- read and edit only Drafts they own;
- prepare Proposal previews;
- cannot approve or send Proposals.

### MANAGER

- all SALES permissions;
- read and edit team Drafts;
- review and approve Proposals;
- cannot send a Proposal externally.

### ADMIN

- all MANAGER permissions;
- send approved Proposals;
- administer users and Product OS settings.

## Enforcement

Permissions are implemented as a Product OS policy independent of the future identity
provider. Draft writes require an authenticated actor and bind `created_by` plus audit
events to that stable user ID. A SALES actor cannot overwrite another user's Draft.

The Product Studio DEV adapter supports a deliberately explicit `dev_token` mode, but
only when all of the following are configured:

- `PRODUCT_STUDIO_ALLOW_DEV_DRAFT_WRITES=true`;
- `SALES_STUDIO_AUTH_MODE=dev_token`;
- a non-empty `SALES_STUDIO_DEV_TOKEN`;
- stable user ID and approved role headers.

Secrets are compared using timing-safe equality. Missing configuration fails closed.
This mode is for controlled development only and is not a production login system.

## Production identity adapter contract

The eventual provider must deliver a verified stable user ID, email and one approved
role. Provider claims must be mapped server-side; the browser may never assign its own
role. The authorization policy remains unchanged if the provider changes.

## Validation

- Product OS V2 tests: 89/89 passing.
- Product Studio production build: passing.
- Anonymous, unknown-role, ownership and approval boundaries: covered by tests.
- Production connections and deployments: none.

## Open Product Owner decision

Choose the company identity source before Phase 6F login implementation. The decision
should follow the account system Better Home already manages operationally (for
example Google Workspace or Microsoft 365), rather than adding a separate staff
password database.

After the provider is chosen, Phase 6F can implement login/session handling, a Sales
Studio shell, Draft list and Draft resume flow.
