# Report Link Migration Plan

Status: Planning only. No code changes in this document.

## 1) Current legacy URL outputs

Confirmed legacy SMS report links from CRM inspections routes:

- `/inspection-report.html?id={inspection_id}`
- `/rental-report.html?id={inspection_id}`

Current generation context:

- Triggered when inspection status is updated to `sent`.
- Sent to customer phone via SMS.
- Built from `REPORT_BASE_URL` (with legacy fallback domain).

## 2) Risk summary

- **Parallel flow risk**: links target legacy report pages instead of the frozen inspection mainline (`apps/essential-report`).
- **Inconsistent user experience**: different product lines may land on different legacy pages.
- **Env fallback risk**: defaulting to a pre-purchase domain can route users to wrong/old pages.
- **Maintenance risk**: old URLs keep legacy pages operational pressure and block framework freeze.

## 3) Recommended unified URL template

Use one inspection-mainline URL pattern for all products:

- **Template**: `{INSPECTION_APP_BASE_URL}/review/{inspection_id}`

Optional compatibility template (if current UI still expects query format):

- `{INSPECTION_APP_BASE_URL}/review?id={inspection_id}`

Rule:

- Do not branch URL by product type (`pre_purchase`, `rental`, etc.).
- Keep one canonical report-view entrypoint based on `inspection_id`.

## 4) Recommended environment variable naming

Primary:

- `INSPECTION_APP_BASE_URL` (canonical, required for new link generation)

Optional transitional aliases (temporary):

- `REPORT_BASE_URL` (legacy alias, to be deprecated)

Recommendation:

- During migration, resolve `INSPECTION_APP_BASE_URL` first.
- Keep `REPORT_BASE_URL` only as temporary fallback with deprecation notice.

## 5) Migration strategy

### Short term (safe cut-in)

- Define canonical URL contract in docs and team conventions.
- Introduce `INSPECTION_APP_BASE_URL` in all target environments.
- Keep existing legacy links unchanged until env readiness is confirmed.

### Mid term (switch generation)

- Switch CRM SMS link generation to unified template:
  - `{INSPECTION_APP_BASE_URL}/review/{inspection_id}`
- Stop generating:
  - `/inspection-report.html?id=...`
  - `/rental-report.html?id=...`
- Keep legacy pages reachable for historical SMS links.

### Long term (retire legacy outputs)

- Add explicit compatibility redirects from legacy paths to canonical review path.
- Monitor access logs for old URL traffic decay.
- Mark legacy report pages as deprecated and schedule archival/removal window.

## 6) Compatibility redirect recommendation

When implementing compatibility layer (later, not in this task):

- Redirect `/inspection-report.html?id={inspection_id}`
  -> `{INSPECTION_APP_BASE_URL}/review/{inspection_id}`
- Redirect `/rental-report.html?id={inspection_id}`
  -> `{INSPECTION_APP_BASE_URL}/review/{inspection_id}`

Preferred behavior:

- Use `301`/`302` HTTP redirects at edge/router level.
- Preserve `inspection_id` exactly.
- Do not alter inspection data or report generation logic.

## 7) Suggested execution order

1. Confirm canonical URL contract and env naming (`INSPECTION_APP_BASE_URL`).
2. Set env in all environments (dev/staging/prod).
3. Switch SMS link generation to canonical template.
4. Add compatibility redirects for legacy URLs.
5. Observe traffic and deprecate legacy pages.
