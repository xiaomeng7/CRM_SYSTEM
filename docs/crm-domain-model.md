# CRM Domain Model — BHT Revenue OS

This document defines the **domain model** for the CRM system. It is the single reference for entities, relationships, lifecycles, source-of-truth rules, events, and database schema. Implementation should follow this model; do not implement features that contradict it without updating this doc first.

---

## 1. Core Entities

### Contact

| Aspect | Description |
|--------|-------------|
| **What it represents** | A person: a customer, prospect, or stakeholder. Has name, phone, email, and optional role. |
| **Why it exists** | CRM is people-centric. Every lead, communication, and task is tied to a person. |
| **Responsibilities** | Be the primary actor for communications; belong to an Account; be the source or owner of Leads and Activities. |
| **Relationships** | Belongs to one **Account** (optional for cold leads). Can create many **Leads**. Has many **Communications**, **Activities**, **Tasks**. |

---

### Account

| Aspect | Description |
|--------|-------------|
| **What it represents** | A business or household: the entity that pays for work and receives invoices. Can be a company or a “household” (single site). |
| **Why it exists** | Groups contacts (e.g. site owner + property manager). One account can have many jobs, opportunities, and inspections over time. |
| **Responsibilities** | Own Contacts; own Opportunities (for that account); be the billing/site context for Inspections and Reports. |
| **Relationships** | Has many **Contacts**. Has many **Opportunities**, **Inspections**, **Reports**. Linked to ServiceM8 Company via **ExternalLink**. |

*Note: The current `customers` table is effectively “Account + primary Contact” combined. The long-term model splits these into Account and Contact; migration can map existing `customers` to one Account and one Contact per row.*

---

### Lead

| Aspect | Description |
|--------|-------------|
| **What it represents** | An inbound or outbound interest: “someone might want our services.” Not yet a committed opportunity. |
| **Why it exists** | Tracks demand from web, referral, or cold outreach. Converts to Opportunity when qualified. |
| **Responsibilities** | Carry source, status, and qualification state; convert to one Opportunity when won; record who contacted and when. |
| **Relationships** | Created by or associated with a **Contact**. Optional **Account**. Converts to one **Opportunity**. Has **Activities**, **Communications**, **Tasks**. |

---

### Opportunity

| Aspect | Description |
|--------|-------------|
| **What it represents** | A real chance to do work: inspection, installation, or advisory. Has value and stage. |
| **Why it exists** | Pipeline: from “we might get the job” to “job booked” to “won/lost.” Drives inspections and reports. |
| **Responsibilities** | Track stage and value; link to one or more Inspections; produce or link to Reports; eventually link to ServiceM8 Job when work is scheduled. |
| **Relationships** | Belongs to **Account**. Optional **Contact** (primary). Can have many **Inspections**. Has **Activities**, **Tasks**. Linked to ServiceM8 Job via **ExternalLink** when job is created. |

---

### Activity

| Aspect | Description |
|--------|-------------|
| **What it represents** | A timestamped interaction or event: call, email, meeting, site visit, form submit. |
| **Why it exists** | Timeline and history: “what did we do with this contact/lead/opportunity?” |
| **Responsibilities** | Store type, timestamp, summary, and optional link to Contact/Lead/Opportunity. |
| **Relationships** | Optional **Contact**, **Lead**, **Opportunity**. No direct link to Inspection/Report; those are first-class entities. |

---

### Communication

| Aspect | Description |
|--------|-------------|
| **What it represents** | An outbound (or logged inbound) message: SMS, email, etc., with delivery state. |
| **Why it exists** | Compliance and follow-up: what was sent, when, and whether it was delivered. |
| **Responsibilities** | Store channel, content, recipient, template name, external ID (e.g. Twilio SID), delivery status. |
| **Relationships** | Linked to **Contact** (or, during migration, to Account via current `customer_id`). Optional **Lead** or **Opportunity**. |

*The existing `communications` table is Communication; it currently points at “customer” (Account/Contact). When Contact exists, link Communication to Contact (and optionally Account).*

---

### Task

| Aspect | Description |
|--------|-------------|
| **What it represents** | A to-do: call back, send report, book inspection, follow up. Can be assigned and due. |
| **Why it exists** | Ensures nothing falls through the cracks; drives workflows. |
| **Responsibilities** | Store title, due date, status (open/done/cancelled), assignee, and optional link to Lead/Opportunity/Inspection. |
| **Relationships** | Optional **Contact**, **Lead**, **Opportunity**, **Inspection**. |

---

### Inspection

| Aspect | Description |
|--------|-------------|
| **What it represents** | A scheduled or completed site inspection: electrical, CCTV, EV, or property inspection. |
| **Why it exists** | Core service type; often precedes a Report and feeds into Opportunity outcome. |
| **Responsibilities** | Track type, status, scheduled date, completion, site address; link to Report(s); optionally link to ServiceM8 Job. |
| **Relationships** | Belongs to **Opportunity**. Can have one or more **Reports**. Optional **Account**/ **Contact**. Linked to ServiceM8 Job via **ExternalLink**. |

---

### Report

| Aspect | Description |
|--------|-------------|
| **What it represents** | A delivered artifact: electrical report, advisory report, quote summary. |
| **Why it exists** | Outcome of inspection or advisory work; triggers follow-up and automation. |
| **Responsibilities** | Store type, status (draft/sent), generated/sent timestamps, storage reference (e.g. URL or file id). |
| **Relationships** | Belongs to **Inspection** (or directly to **Opportunity** for advisory-only). Optional **Account**/ **Contact** for recipient. |

---

### ExternalLink

| Aspect | Description |
|--------|-------------|
| **What it represents** | A link from a CRM entity to an external system’s ID (e.g. ServiceM8 Company UUID, Job UUID). |
| **Why it exists** | Decouples CRM from external systems: we store our UUIDs; ExternalLink stores “this Account = ServiceM8 Company X”, “this Job = ServiceM8 Job Y”. |
| **Responsibilities** | Store system name, entity type, external id, and local entity reference (e.g. account_id, opportunity_id). |
| **Relationships** | Many-to-one to the local entity (Account, Opportunity, Inspection, etc.). One row per (system, external_id) to avoid duplicates. |

---

## 2. Key Relationships (Summary)

- **Account** → has many **Contacts**; has many **Opportunities**, **Inspections**, **Reports**.
- **Contact** → belongs to one **Account** (optional); can create many **Leads**; has **Communications**, **Activities**, **Tasks**.
- **Lead** → has one **Contact** (and optional **Account**); converts to one **Opportunity**; has **Activities**, **Communications**, **Tasks**.
- **Opportunity** → belongs to **Account** (and optional primary **Contact**); has many **Inspections**; has **Activities**, **Tasks**; can link to one ServiceM8 Job via **ExternalLink**.
- **Inspection** → belongs to **Opportunity**; can produce one or more **Reports**; can link to ServiceM8 Job via **ExternalLink**.
- **Report** → belongs to **Inspection** (or **Opportunity**); can trigger automation when status becomes “sent”.
- **Activity** / **Communication** / **Task** → optionally link to **Contact**, **Lead**, **Opportunity** (and Task to **Inspection**).
- **ServiceM8 Company** → synced/linked to **Account** (and primary Contact) via **ExternalLink**.
- **ServiceM8 Job** → linked to **Opportunity** or **Inspection** via **ExternalLink** when the job is created for that opportunity/inspection.

---

## 3. Lifecycle / State Machines

### Lead

| Stage | Meaning |
|-------|--------|
| `new` | Just created; not yet contacted. |
| `contacted` | We have reached out (call, email, SMS). |
| `qualified` | Fit and interest confirmed; ready to move to opportunity. |
| `disqualified` | Not a fit or not interested; no conversion. |
| `converted` | Became an Opportunity; lead is closed. |

**Transitions:** new → contacted → qualified → converted. Any non-converted state can → disqualified. Only qualified can → converted (and we create an Opportunity).

---

### Opportunity

| Stage | Meaning |
|-------|--------|
| `discovery` | Early conversation; need not yet have inspection. |
| `inspection_booked` | Inspection (or equivalent) is scheduled. |
| `inspection_completed` | Site visit done; report may be pending. |
| `report_sent` | Report (or quote) has been sent to client. |
| `won` | Work booked (e.g. ServiceM8 job created); opportunity closed won. |
| `lost` | Did not proceed; opportunity closed lost. |

**Transitions:** discovery → inspection_booked → inspection_completed → report_sent → won (or lost from discovery / inspection_booked / report_sent). Stages support pipeline reporting and automation (e.g. “when report_sent, schedule follow-up task”).

---

### Inspection

| Stage | Meaning |
|-------|--------|
| `scheduled` | Date/time set; not yet done. |
| `in_progress` | On site or in progress. |
| `completed` | Done; report may be pending. |
| `cancelled` | Will not happen. |

**Transitions:** scheduled → in_progress → completed; any → cancelled. When completed, we can auto-create or link a Report and drive Opportunity to inspection_completed.

---

### Report

| Stage | Meaning |
|-------|--------|
| `draft` | Being prepared; not sent. |
| `sent` | Delivered to client. |
| `viewed` | Optional: client viewed (if tracked). |

**Transitions:** draft → sent (→ viewed). “Report sent” is the key event for automation (e.g. send follow-up SMS, create Task, move Opportunity to report_sent).

---

## 4. Source of Truth Rules

| Data | Owner | Notes |
|------|--------|------|
| Contacts, Accounts, Leads, Opportunities, Inspections, Reports, Activities, Communications, Tasks | **CRM** | Stored in our DB; UI and automation use our IDs and stages. |
| Lead status, Opportunity stage, Communication history | **CRM** | ServiceM8 does not manage leads or pipeline. |
| Job execution, technician scheduling, job completion status | **ServiceM8** | We sync job and company data into CRM but do not overwrite operational state in ServiceM8. |
| Company (name, address, contact details) | **Sync** | ServiceM8 is authoritative for “field” data; we sync into Account/Contact and optionally overwrite on sync, or treat as read-only copy. |
| Job (date, type, value, status, completion) | **Sync** | ServiceM8 is authoritative; we sync into `jobs` and link via ExternalLink to Opportunity/Inspection. |

**Synchronization:**

- **ServiceM8 → CRM:** Scheduled sync (e.g. cron) fetches Companies and Jobs; we upsert into `accounts`/`contacts` and `jobs` (or equivalent), and maintain **ExternalLink** rows (system = 'servicem8', external_id = Company/Job UUID).
- **CRM → ServiceM8:** When we “book” work (e.g. Opportunity won), we create a Job in ServiceM8 via API (if supported) and store the returned UUID in ExternalLink. We do not push lead/opportunity stages to ServiceM8.
- **Reports / documents:** Generated and stored by CRM (or a dedicated service); Report record and “sent” status are owned by CRM.

---

## 5. Event Model

Events support automation, auditing, and future integrations. Prefer one event type per meaningful state change.

| Event | When | Use |
|-------|------|-----|
| `lead.created` | New lead record created. | Assign task, send welcome, add to list. |
| `lead.qualified` | Lead stage → qualified. | Notify, create Opportunity. |
| `lead.converted` | Lead → converted (Opportunity created). | Update reporting, close lead. |
| `opportunity.created` | New opportunity (from lead or manual). | Pipeline metrics, first task. |
| `opportunity.stage_changed` | Stage transition. | Stage-specific automation (e.g. inspection_booked → remind day before). |
| `opportunity.won` / `opportunity.lost` | Opportunity closed. | Reporting, follow-up campaigns. |
| `inspection.booked` | Inspection scheduled. | Reminders, calendar. |
| `inspection.completed` | Inspection completed. | Create Report, move Opportunity to inspection_completed. |
| `report.generated` | Report created (draft). | Optional notification. |
| `report.sent` | Report status → sent. | **Key:** trigger follow-up SMS, task, move Opportunity to report_sent. |
| `communication.sent` | Outbound message sent. | Log; cooldown for automations. |

**Implementation note:** Store events in `domain_events` (or equivalent) with at least: event_type, entity_type, entity_id, payload (JSON), occurred_at. Automation engine and future workers consume from this table (or an outbox).

---

## 6. Database Schema (Proposed)

All new tables use **UUID primary keys** and **created_at / updated_at**. Use **created_by** (user or system) where useful. Existing `customers` / `jobs` / `communications` can stay during migration; new features use the tables below.

### accounts

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | default gen_random_uuid() |
| name | VARCHAR(255) | Business or household name |
| address_line | TEXT | |
| suburb | VARCHAR(100) | |
| postcode | VARCHAR(20) | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| created_by | VARCHAR(100) | optional |

*Migration: existing `customers` can be backfilled into `accounts` + one `contacts` row each; keep `customers` for sync until cutover.*

---

### contacts

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| account_id | UUID FK(accounts) | nullable |
| name | VARCHAR(255) | |
| email | VARCHAR(255) | |
| phone | VARCHAR(50) | |
| role | VARCHAR(100) | optional |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| created_by | VARCHAR(100) | optional |

---

### leads

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| contact_id | UUID FK(contacts) | nullable for anonymous |
| account_id | UUID FK(accounts) | nullable |
| source | VARCHAR(100) | web, referral, cold, etc. |
| status | VARCHAR(50) | new, contacted, qualified, disqualified, converted |
| converted_opportunity_id | UUID FK(opportunities) | set when converted |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| created_by | VARCHAR(100) | optional |

---

### opportunities

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| account_id | UUID FK(accounts) | |
| contact_id | UUID FK(contacts) | optional primary contact |
| lead_id | UUID FK(leads) | optional, set when converted from lead |
| stage | VARCHAR(50) | discovery, inspection_booked, inspection_completed, report_sent, won, lost |
| value_estimate | DECIMAL(12,2) | optional |
| closed_at | TIMESTAMPTZ | when won/lost |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| created_by | VARCHAR(100) | optional |

---

### activities

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| contact_id | UUID FK(contacts) | nullable |
| lead_id | UUID FK(leads) | nullable |
| opportunity_id | UUID FK(opportunities) | nullable |
| activity_type | VARCHAR(50) | call, email, meeting, site_visit, form_submit |
| summary | TEXT | |
| occurred_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |
| created_by | VARCHAR(100) | optional |

---

### communications

*Extend existing table or add new one with UUID. If extending, add contact_id (nullable) and keep customer_id during migration.*

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK (or keep SERIAL) | |
| contact_id | UUID FK(contacts) | preferred long-term |
| customer_id | INTEGER FK(customers) | legacy; phase out |
| lead_id | UUID FK(leads) | nullable |
| opportunity_id | UUID FK(opportunities) | nullable |
| channel | VARCHAR(20) | sms, email |
| template_name | VARCHAR(100) | |
| message_content | TEXT | |
| sent_at | TIMESTAMPTZ | |
| delivery_status | VARCHAR(50) | |
| external_id | VARCHAR(100) | e.g. Twilio SID |
| created_at | TIMESTAMPTZ | |

---

### tasks

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| contact_id | UUID FK(contacts) | nullable |
| lead_id | UUID FK(leads) | nullable |
| opportunity_id | UUID FK(opportunities) | nullable |
| inspection_id | UUID FK(inspections) | nullable |
| title | VARCHAR(255) | |
| due_at | TIMESTAMPTZ | nullable |
| status | VARCHAR(20) | open, done, cancelled |
| assigned_to | VARCHAR(100) | optional |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| created_by | VARCHAR(100) | optional |

---

### inspections

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| opportunity_id | UUID FK(opportunities) | |
| account_id | UUID FK(accounts) | optional |
| contact_id | UUID FK(contacts) | optional |
| inspection_type | VARCHAR(100) | electrical, cctv, ev, property |
| status | VARCHAR(50) | scheduled, in_progress, completed, cancelled |
| scheduled_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | nullable |
| address | TEXT | |
| notes | TEXT | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| created_by | VARCHAR(100) | optional |

---

### reports

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| inspection_id | UUID FK(inspections) | nullable for advisory-only |
| opportunity_id | UUID FK(opportunities) | |
| report_type | VARCHAR(100) | electrical, advisory, quote_summary |
| status | VARCHAR(20) | draft, sent, viewed |
| generated_at | TIMESTAMPTZ | nullable |
| sent_at | TIMESTAMPTZ | nullable |
| storage_ref | VARCHAR(500) | URL or file id |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| created_by | VARCHAR(100) | optional |

---

### external_links

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| system | VARCHAR(50) | e.g. servicem8 |
| external_entity_type | VARCHAR(50) | company, job |
| external_id | VARCHAR(255) | UUID or id in external system |
| local_entity_type | VARCHAR(50) | account, opportunity, inspection |
| local_entity_id | UUID | our entity id |
| created_at | TIMESTAMPTZ | |

Unique on (system, external_entity_type, external_id). Enables “get our Account for ServiceM8 Company X” and “get our Opportunity/Inspection for ServiceM8 Job Y”.

---

### domain_events

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| event_type | VARCHAR(100) | e.g. report.sent |
| entity_type | VARCHAR(50) | report, opportunity, lead |
| entity_id | UUID | |
| payload | JSONB | event payload |
| occurred_at | TIMESTAMPTZ | |
| processed_at | TIMESTAMPTZ | nullable; for async consumers |

Index on (processed_at, occurred_at) and on event_type for automation triggers.

---

## 7. Mapping from Current Schema

| Current | Target | Notes |
|---------|--------|-------|
| customers | accounts + contacts | One account per customer; one primary contact. Keep `customers` and sync until migration; then sync ServiceM8 Company → accounts/contacts and ExternalLink. |
| jobs | jobs (unchanged) + external_links | Keep `jobs` for sync; add external_links (system=servicem8, external_entity_type=job, external_id=servicem8_uuid, local_entity_type=opportunity or inspection, local_entity_id=…). |
| communications | communications | Add contact_id, lead_id, opportunity_id; keep customer_id during migration. |

---

## 8. Document History

- Initial version: core entities, relationships, lifecycles, source of truth, events, and proposed schema for BHT Revenue OS CRM.
