# CRM Minimal API — Leads & Opportunities

Minimal REST API for the new CRM domain model. No UI, no automation workers; API foundation only.

---

## Endpoints

### Leads

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/leads` | Create a lead |
| GET | `/api/leads` | List leads (filter by status) |
| GET | `/api/leads/:id` | Get lead by ID |
| PATCH | `/api/leads/:id/status` | Update lead status |
| POST | `/api/leads/:id/convert` | Convert lead to opportunity |

### Opportunities

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/opportunities` | Create an opportunity |
| GET | `/api/opportunities` | List opportunities (filter by stage, account_id) |
| GET | `/api/opportunities/:id` | Get opportunity by ID |
| PATCH | `/api/opportunities/:id/stage` | Update opportunity stage |

---

## Payloads

### POST /api/leads

```json
{
  "contact_id": "uuid",
  "account_id": "uuid",
  "source": "web|referral|cold|...",
  "created_by": "string"
}
```

All fields optional. Status defaults to `new`.

### PATCH /api/leads/:id/status

```json
{
  "status": "new|contacted|qualified|disqualified|converted",
  "created_by": "string"
}
```

### POST /api/leads/:id/convert

```json
{
  "stage": "discovery",
  "value_estimate": 5000,
  "created_by": "string"
}
```

Creates a new opportunity linked to the lead, sets `lead.converted_opportunity_id`, and updates lead status to `converted`.

### POST /api/opportunities

```json
{
  "account_id": "uuid",
  "contact_id": "uuid",
  "lead_id": "uuid",
  "stage": "discovery|inspection_booked|inspection_completed|report_sent|won|lost",
  "value_estimate": 5000,
  "created_by": "string"
}
```

`account_id`, `contact_id`, `lead_id` optional. `stage` defaults to `discovery`.

### PATCH /api/opportunities/:id/stage

```json
{
  "stage": "discovery|inspection_booked|inspection_completed|report_sent|won|lost",
  "created_by": "string"
}
```

When stage is `won` or `lost`, `closed_at` is set automatically.

---

## Lead Conversion Flow

1. Client calls `POST /api/leads/:id/convert` with optional `stage`, `value_estimate`, `created_by`.
2. Service validates lead exists and is not already converted.
3. Service creates a new opportunity with `lead_id` set, `account_id` and `contact_id` copied from lead.
4. Service updates lead: `status = 'converted'`, `converted_opportunity_id = <new opportunity id>`.
5. Domain events emitted: `lead.converted`, `opportunity.created`.
6. Response: `{ lead: {...}, opportunity: {...} }`.

---

## Domain Events Emitted

| Event | When | Payload |
|-------|------|---------|
| `lead.created` | Lead created | `lead_id`, `source` |
| `lead.status_changed` | Lead status updated | `lead_id`, `previous_status`, `new_status` |
| `lead.converted` | Lead converted to opportunity | `lead_id`, `opportunity_id` |
| `opportunity.created` | Opportunity created | `opportunity_id`, `lead_id`, `stage` |
| `opportunity.stage_changed` | Opportunity stage updated | `opportunity_id`, `previous_stage`, `new_stage` |

Events are stored in `domain_events` with `processed_at = null`. Future automation workers consume from this table.

---

## Validation Rules

- **Lead statuses:** `new`, `contacted`, `qualified`, `disqualified`, `converted`
- **Opportunity stages:** `discovery`, `inspection_booked`, `inspection_completed`, `report_sent`, `won`, `lost`
- **IDs:** Must be valid UUIDs. Invalid IDs return 404 for get/update, or are ignored for optional FKs on create.
- **Converted leads:** Cannot update status; cannot convert again.

---

## Assumptions

- `contact_id`, `account_id` are optional when creating leads/opportunities. Accounts and contacts API not yet implemented; callers can pass UUIDs from future APIs or manual inserts.
- `created_by` is a free-form string (e.g. user email or system identifier).
- No auth; API is internal. Add auth layer when exposing beyond internal tools.
- List endpoints default to `limit=100`, `offset=0`. No pagination metadata in response yet.
