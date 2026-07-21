# CRM → Better Home Proposal → ServiceM8 mapping

## Canonical flow

| Stage | Canonical record | Required references | Result |
|---|---|---|---|
| Relationship | CRM Contact + Account | `contact.id`, `account.id` | One known customer relationship |
| Site | CRM Asset | `asset.id`, `account_id` | One installation property |
| Sale | CRM Opportunity | Contact + Account + Asset | One commercial decision |
| Selection | Product OS Draft | CRM four-part reference | Editable versioned selection |
| Offer | Product OS Proposal | Immutable Draft Version | Fixed Better Home commercial offer |
| Acceptance | Proposal acceptance event | Proposal + actor + timestamp | Authorises operational handoff |
| Delivery | ServiceM8 Job / Work Order | ServiceM8 Company UUID + CRM Opportunity | Scheduling and field execution |
| Billing | ServiceM8 Invoice | ServiceM8 Job UUID | Final invoice and payment state |

## Existing components reused

- `accounts`, `contacts`, `assets`, `opportunities` — CRM master data.
- `external_links` — active ServiceM8 Company UUID → CRM Account mapping.
- `jobs`, `quotes`, `invoices`, `job_materials` — ServiceM8-derived operational mirrors.
- `ensureServiceM8LinkForAccount` — idempotent Company lookup/create boundary.
- `pos2_draft_customer_links` — Product OS reference boundary.
- Product OS Proposal version/fingerprint — immutable Better Home commercial snapshot.

## Required Opportunity policy

Each Opportunity must eventually declare exactly one commercial channel:

- `SERVICEM8_QUOTE`
- `BETTER_HOME_PROPOSAL`

Legacy Opportunities may remain unspecified until they next enter an active quoting action. No bulk assumption should rewrite historical records.

## Handoff payload (future)

An accepted Better Home Proposal should create an internal outbox item containing only stable identifiers and the accepted version:

- CRM Opportunity ID;
- CRM Account ID;
- CRM Contact ID;
- CRM Asset ID;
- Product OS Proposal ID/code;
- Proposal version/fingerprint;
- idempotency key;
- requested ServiceM8 operation.

The worker then resolves current CRM and Product OS facts, ensures the ServiceM8 Company mapping, creates one Work Order, stores the ServiceM8 Job UUID, and marks the outbox item completed. Retries must return the existing Job rather than create another.

## Explicit exclusions

- Do not use name-only customer matching.
- Do not copy the legacy `customers` row into Product OS.
- Do not allow a ServiceM8 Quote and Better Home Proposal to compete on one Opportunity.
- Do not create a Work Order merely because a Proposal was internally approved.
- Do not generate a Product OS final Invoice.
- Do not treat `do_not_contact` as a ban on necessary transactional documents.
