# Lead intake flow — Landing → CRM

Initial wiring for Energy Decision Advisory landing page into the CRM.

## Flow overview

- **User submits form** on `apps/web/landing-page/index.html` (`#apply-form`).
- Browser sends `POST /api/apply-advisory` to the **Netlify function** `apps/web/landing-page/netlify/functions/apply-advisory.ts`.
- The Netlify function:
  - Saves the application into `advisory_applications` (Neon).
  - **Calls the CRM API** `POST {CRM_API_BASE_URL}/api/public/leads`.
  - Sends internal notification email (unchanged).
- The CRM API (apps/crm) `POST /api/public/leads`:
  - Creates an `accounts` row (simple residential account).
  - Creates a `contacts` row linked to that account.
  - Creates a `leads` row linked to the contact/account, `status = 'new'`.
  - Writes a `domain_events` record with `event_type = 'lead.created'`.
  - Optionally logs an `activities` row capturing the free-text message.
- The new lead appears in the **Internal CRM Leads list** (`/leads.html`).

## Landing page submission

- **Form:** `apps/web/landing-page/index.html`, `<form id="apply-form">`.
- **Browser endpoint:** `POST /api/apply-advisory` (Netlify).
- **Client payload (simplified):**
  - `name` (Full name)
  - `mobile`
  - `email`
  - `suburb`
  - `property_type`
  - `solar_battery_status`
  - `bill_range`
  - `contact_time`
  - `notes` (optional)
  - `utm_source`, `utm_medium`, `utm_campaign`, `page_url` (optional)
  - `source` (`pro_direct` \| `lite_upgrade`)
  - `lite_snapshot` (optional JSON string)

## Netlify function → CRM API

- **Function:** `apps/web/landing-page/netlify/functions/apply-advisory.ts`.
- After inserting into `advisory_applications`, it builds a CRM payload:

  - **Mapped fields:**
    - `name` → `name`
    - `mobile` → `phone`
    - `email` → `email`
    - `suburb` → `suburb`
    - `source`:
      - `pro_direct` → `"landing:advisory"`
      - `lite_upgrade` → `"landing:advisory:lite_upgrade"`
    - `service_type` → `"energy_advisory"`
    - `message` → concatenation of:
      - `Property type: {property_type}`
      - `Solar/battery status: {solar_battery_status}`
      - `Bill range: {bill_range}`
      - `Contact time: {contact_time}`
      - `Notes: {notes}` (if present)
  - **Context payload:**
    - `raw_payload`:
      - `application_id`
      - `utm_source`, `utm_medium`, `utm_campaign`
      - `page_url`

- **CRM base URL:** `CRM_API_BASE_URL` environment variable in Netlify.
  - Example: `https://<your-railway-domain>.up.railway.app`.
  - Function posts to: `{CRM_API_BASE_URL}/api/public/leads`.
  - Failure to call CRM is **logged but does not block** the user’s submission.

## CRM public leads API

- **Route file:** `apps/crm/api/routes/public-leads.js`.
- **Endpoint:** `POST /api/public/leads`.
- **Expected body:**
  - `name` (required)
  - `phone` (required)
  - `email` (required)
  - `suburb` (required)
  - `source` (optional; default `"landing:advisory"`)
  - `service_type` (optional, e.g. `"energy_advisory"`)
  - `message` (optional free text)
  - `raw_payload` (optional object; original data for audit/analysis)
- **Behavior:**
  - Validates required fields; returns `400` if missing.
  - Delegates to `services/public-leads.createFromPublic`.
  - Returns `201` with JSON:
    - `{ ok: true, lead_id, contact_id, account_id }`.

### Service: `services/public-leads.js`

- Inserts:
  - `accounts`:
    - `name` = landing `name`
    - `suburb` = landing `suburb`
    - `status` = `"active"`
    - `created_by` = `"landing-page"`
  - `contacts`:
    - `account_id` = above account
    - `name`, `email`, `phone`
    - `status` = `"active"`
    - `created_by` = `"landing-page"`
  - `leads`:
    - `contact_id`, `account_id`
    - `source` (from request or default)
    - `status` = `"new"`
    - `created_by` = `"landing-page"`
  - `activities` (optional):
    - `contact_id`, `lead_id`
    - `activity_type` = `"web_form"`
    - `summary` = `"Service type: … — {message}"` (if present)
    - `created_by` = `"landing-page"`
- Emits domain event via `lib/domain-events.emit`:
  - `event_type` = `"lead.created"`
  - `aggregate_type` = `"lead"`
  - `aggregate_id` = `lead.id`
  - `payload` includes:
    - `lead_id`
    - `source`
    - `service_type`
    - `channel = "web"`
    - `raw_payload` (if provided)

## How it surfaces in the CRM UI

- **Leads list:** `apps/crm/public/leads.html` calls `GET /api/leads`.
  - Newly created leads appear with `status = "new"` and `source` set from landing page.
  - Name/phone/suburb will come from the associated `contacts`/`accounts` (via future view/join).
- **Lead detail:** `lead-detail.html?id=<lead_id>` calls `GET /api/leads/:id`.
  - The `lead_id` returned from `/api/public/leads` can be used to deep-link from future confirmations, if needed.

## Notes / next steps

- **No SMS automation** is wired for this intake yet; only the `lead.created` domain event is recorded.
- Validation is intentionally minimal in the CRM endpoint; primary validation lives in the Netlify function.
- Future work:
  - Add a read-model that joins leads + contacts + accounts for richer list/detail views.
  - Optionally create follow-up tasks when a lead is created from this channel.

