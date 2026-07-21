# Phase 6G — Single-admin Sales Studio

Status: Completed for Neon DEV

## Outcome

The first database-backed Sales Studio screen is available at `/sales` in Product Studio. It gives the initial administrator a quiet operational view of selections moving towards a proposal.

The screen reads Product OS V2 sales data and shows:

- active Draft count;
- Drafts ready for review;
- customer links requiring review;
- approved Proposal count;
- recent Drafts, with customer, owner, link, version, status and indicative total;
- an empty state and entry to the existing configurator.

## Access boundary

- The page is locked by default.
- Local preview requires the explicit `single_admin_dev` mode and the registered administrator email.
- Production refuses this development shortcut unless a separate explicit production override is present.
- The service applies the existing SALES / MANAGER / ADMIN visibility policy.
- The initial administrator is `meng.z@bhtechnology.com.au` with role `ADMIN` in Neon DEV.

This is not the final login system. It is a controlled bridge for building the single-user workflow before choosing the production identity provider and session implementation.

## Data and side effects

- Source of truth: Neon DEV Product OS V2 sales tables.
- Dashboard operation: read-only.
- Draft or Proposal creation during verification: none.
- CRM or ServiceM8 write: none.
- Production connection or change: none.

## Verification

- Product OS V2 tests: 92/92 passed.
- Product Studio production build: passed; `/sales` is server-rendered.
- Desktop visual review: passed.
- Mobile review at 390px: passed after removing horizontal overflow (`scrollWidth = clientWidth = 390`).

## Next product step

Build the Draft detail/resume screen so a saved customer selection can be reopened, reviewed and deliberately advanced towards a Proposal. Real login/session integration can follow after the internal workflow is coherent.
