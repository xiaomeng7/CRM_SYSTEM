# Builder Intelligence — Conversion Boundary (PR8A)

Builder prospects live in `b2b_prospects` with `prospect_type = 'builder'`.

PR8A does **not** implement conversion. This document defines the boundary for future PRs.

## Do not use B2C leads pipeline

Builder acquisition is B2B outbound. Do **not**:

- Create rows in `leads` for builder prospects
- Route builder intake through `/api/public/leads`
- Copy UTM/gclid attribution from consumer landing pages

## When to create an Account

Create an `accounts` row (`account_type = 'partner'`) only when:

- `relationship_stage` is `meeting_booked` or later, **and**
- There is a verbal or written commitment to explore partnership, **or**
- The builder is already sending work / has an active project discussion

Until then, keep all data on `b2b_prospects` and set `linked_account_id` when the account is created.

## When to create an Opportunity

Create an `opportunities` row only when:

- There is a **specific project** or quote request (site, scope, or tender), **and**
- An `account_id` exists (or is created in the same transaction)

Pipeline stage starts at `new_inquiry` or an internal builder-specific stage — not via lead conversion.

## When to create Contacts

- **During prospecting:** use `decision_maker_name` / `decision_maker_role` on the prospect row
- **After account creation:** create `contacts` linked to the partner account for each decision maker

## Operational events (future)

Detectors may reference:

- `entity_type`: `b2b_prospect`
- `entity_id`: prospect UUID

Event types (reserved in PR8A, not auto-generated yet):

- `builder_research_needed`
- `builder_followup`
- `builder_reply_received`
- `builder_meeting_needed`

## PR8B+ scope

- Research engine and scoring update prospect fields only
- Conversion workflow (account + opportunity) is a separate PR after outreach is proven
