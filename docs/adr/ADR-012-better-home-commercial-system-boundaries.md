# ADR-012 — Better Home commercial system boundaries

Status: Accepted

Date: 2026-07-20

## Context

The existing CRM was initially built around ServiceM8 history, relationship management and reactivation campaigns. It already imports ServiceM8 companies, contacts, jobs, quotes, invoices and job materials. Better Home now adds a structured Product OS, Configurator and branded Proposal workflow that cannot be reduced to ordinary labour/material quoting.

The previous CRM document stated that every quote must be produced in ServiceM8. That remains correct for conventional electrical/service work, but is no longer correct for Better Home product sales.

## Decision

Two quotation channels are supported, with one channel selected per Opportunity:

1. `SERVICEM8_QUOTE` — conventional electrical and service work. ServiceM8 owns quote creation, delivery and acceptance.
2. `BETTER_HOME_PROPOSAL` — Better Home Foundation, Collection, Experience and Add-on sales. Product OS owns configuration, commercial rules, Proposal versioning and customer acceptance.

Both accepted channels converge on ServiceM8 for operational delivery:

`Accepted commercial offer → ServiceM8 Work Order → completion → ServiceM8 Invoice`

For `BETTER_HOME_PROPOSAL`, the created ServiceM8 Job status is `Work Order`. No ServiceM8 Quote is created for the accepted Better Home scope. The Product OS Proposal remains the sole commercial offer.

There must never be two active commercial masters for the same Opportunity. A Better Home Proposal may be attached to the ServiceM8 Job Diary and represented as JobMaterial lines, but ServiceM8 must not independently recalculate or issue a competing quote for that scope.

## Ownership

| Fact | System of record |
|---|---|
| Account, Contact, Property/Asset, Opportunity | CRM |
| Marketing consent and do-not-contact | CRM |
| Better Home product, dependency, scope and price | Product OS |
| Better Home Draft and Proposal | Product OS Sales Studio |
| Conventional service Quote | ServiceM8 |
| Work Order, schedule, technician execution, variation | ServiceM8 |
| Final Invoice and payment operational status | ServiceM8 |
| Accounting ledger and tax reporting | Accounting platform when integrated |

## Identity

The canonical customer model is `accounts + contacts + assets`. The legacy `customers` table is a ServiceM8-derived compatibility/read model and must not become the Better Home customer master.

Product OS stores boundary references only:

- CRM Contact ID;
- CRM Account ID;
- CRM Asset ID (installation property/site);
- CRM Opportunity ID.

It also stores immutable customer snapshots on Draft Versions and Proposals so historical documents remain intelligible if CRM details later change.

## ServiceM8 identity mapping

The existing `external_links` table remains the active ServiceM8 identity map because production sync code already uses it. The later `integration_links` table is not introduced as a second competing path until a separate consolidation migration is approved.

ServiceM8 Company UUID maps to CRM Account. ServiceM8 Job, Quote and Invoice UUIDs map through their existing CRM tables and Opportunity relationships. All outbound creation must be idempotent.

## Invoice decision

Better Home does not issue a second final Invoice. Product OS may calculate a Proposal and accepted contract value, but ServiceM8 owns the final operational Invoice because it has the completed job, field variations, materials, payment and scheduling context.

## Consequences

- Existing ServiceM8 quote automation remains valid for non-Better-Home work.
- Better Home requires an explicit Opportunity `commercial_channel` before customer delivery.
- Proposal approval is not customer acceptance.
- Customer acceptance is not ServiceM8 Job creation; an auditable integration task sits between them.
- Invoice totals may legitimately differ from accepted Proposal totals only through recorded variation/adjustment rules.
- Marketing permission remains independent of transactional communications.
