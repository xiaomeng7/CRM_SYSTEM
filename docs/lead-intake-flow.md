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
  - `click_id` (optional; generic click identifier)
  - `gclid` (optional; Google click identifier, separate from click_id)
  - `landing_variant_id` (optional; from `landing_variant_id`/`lv` query param)
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
      - `click_id`, `gclid`, `landing_variant_id`
    - top-level passthrough:
      - `click_id`, `gclid`, `landing_variant_id`

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

## Pre-purchase electrical inspection (`apps/web/pre-purchase-landing`)

- **Form:** `apps/web/pre-purchase-landing/index.html` → `POST /api/apply-pre-purchase` (Netlify function `netlify/functions/apply-pre-purchase.ts`).
- **CRM:** `POST {CRM_API_BASE_URL}/api/public/leads` with `product_type` / `service_type` = `pre_purchase`, `source` = `landing:pre_purchase` (or `inspector` + required `sub_source` when the URL is an inspector referral).

**Query / body attribution (optional; all omitted when not present):**

| Incoming (URL or JSON) | CRM / meaning |
|------------------------|----------------|
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` | Top-level UTM fields + echoed in `raw_payload` |
| `gclid`, `click_id` | Top-level + `raw_payload` (offline conversion / click correlation) |
| `lpv` or `landing_page_version` | `landing_page_version` (lpv alias on the client) |
| `cv` or `creative_version` | `creative_version` (cv alias on the client) |
| `source=inspector` with `sub` or `sub_source` | CRM `source=inspector` and sanitized `sub_source` (same rules as advisory/rental) |

Neon `advisory_applications` still stores only legacy columns (`utm_*` / `page_url`); extra attribution is appended into the combined notes string there and fully reflected on the CRM lead via `raw_payload` and top-level fields above.

## Google offline conversions (dual signals, v1)

Full operations guide: [google-offline-conversions.md](./google-offline-conversions.md).

Two queued event types in `google_offline_conversion_events` (Google Ads click conversions upload):

| `event_type`       | Meaning | Typical conversion value |
|--------------------|---------|---------------------------|
| `opportunity_won`  | CRM `opportunities.stage` is **`won`** (earlier pipeline signal). | `opportunities.value_estimate` if set, else **0** (not paid revenue). |
| `invoice_paid`     | Invoice paid / complete (stronger revenue signal). | Invoice amount. |

**Won rule (auditable):** a row is enqueued when stage becomes `won` via `opportunities.updateStage` or `advanceOpportunityStage` (e.g. quote accepted). Re-enqueue is deduped by `dedupe_key = opportunity_won:<opportunity_id>`; `sent` rows are not overwritten.

**Conversion actions (env):** per-type override, then legacy global fallback:

1. `GOOGLE_ADS_OFFLINE_CONVERSION_ACTION_OPPORTUNITY_WON` → `opportunity_won`
2. `GOOGLE_ADS_OFFLINE_CONVERSION_ACTION_INVOICE_PAID` → `invoice_paid`
3. `GOOGLE_ADS_OFFLINE_CONVERSION_ACTION` → fallback for either type if the specific key is unset

If the won-specific action is missing, `opportunity_won` rows are still inserted with `status = skipped` and `error_message = missing_conversion_action_resource_name` (same pattern as missing gclid).

**gclid (trusted):** `pickTrustedGclid` — prefer `lead_attribution_events.gclid`, then `leads.gclid`, then conservative Google-like `click_id` fallback. No fabrication.

**Manual checks:**

- Enqueue: `POST /api/admin/google-offline-conversions/enqueue-opportunity-won` with `opportunity_id` + `sync_secret` (or header `x-sync-secret`).
- List: `GET /api/admin/google-offline-conversions?event_type=opportunity_won`
- Summary: `GET /api/admin/google-offline-conversions/summary` (optional `event_type=opportunity_won`)
- Upload dry run: `npm run google-offline-conversions:upload:dry` (see `summary.by_event_type` on the response)
- CLI: `npm run google-offline-conversions:test-opportunity-won -- <opportunity_uuid>`

## Notes / next steps

- **No SMS automation** is wired for this intake yet; only the `lead.created` domain event is recorded.
- Validation is intentionally minimal in the CRM endpoint; primary validation lives in the Netlify function.
- Future work:
  - Add a read-model that joins leads + contacts + accounts for richer list/detail views.
  - Optionally create follow-up tasks when a lead is created from this channel.

