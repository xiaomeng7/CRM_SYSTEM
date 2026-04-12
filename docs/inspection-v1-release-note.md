# Inspection v1 Release Note

## 1. Overview

- **Release goal**: complete v1 productization baseline for the technician inspection system on a single execution mainline.
- **System position**: one inspection mainline with productized behavior driven by product code + add-ons, not multiple parallel inspection systems.
- **Current status**: **Core flow verified, entering stabilization**.

## 2. Core Architecture (Frozen)

- **Single mainline**: `apps/essential-report`.
- **Product differentiation only via**:
  - `inspection_product`
  - `selected_addons`
- **Execution engine**: `Wizard` is the only execution runtime.
- **Execution fact**: `raw.resolved_steps` is the persisted execution truth for each inspection.
- **Verification entry**: `ReviewPage` is the single review/checkpoint entry.
- **Unified report entry**: `/review/{inspection_id}`.
- **Delivery mode**:
  - `essential_full` -> Word report
  - non-`essential_full` products -> HTML summary
- **Constraint**: no new parallel rental/pre-purchase/energy inspection pages or duplicated Wizard flows.

## 3. Verified End-to-End Flow

- Verified chain:
  - CRM inspection
  - -> `submitInspection`
  - -> EH inspection id generated
  - -> CRM `review_inspection_id` backfilled
  - -> `status = sent`
  - -> SMS link generated as `/review/{EH-id}`
  - -> `/review/{EH-id}` accessible
- **ID model is explicit**:
  - CRM inspection primary key remains UUID.
  - essential-report inspection id remains `EH-YYYY-MM-XXX`.
  - `review_inspection_id` is the **single bridge field** between the two systems.

## 4. Key Implementations

- Product structure execution based on `inspection_product` + `selected_addons`.
- Unified step resolution via `resolveEffectiveWizardSteps(...)`.
- Persisted execution snapshot via `raw.resolved_steps`.
- HTML fallback branch for non-`essential_full` report delivery.
- CRM bridge field + backfill mechanism: `review_inspection_id`.
- CRM SMS report links unified to `/review/{EH-id}` semantics.
- Guardrail for incorrect send behavior:
  - when `review_inspection_id` is missing, return `409 Missing review_inspection_id`
  - no silent fallback to CRM UUID-based wrong review link.

## 5. Out of Scope

- No multi-inspection-system expansion in v1.
- No standalone rental/pre-purchase inspection page line as new mainline.
- No report-engine refactor in this phase.
- No complex rules engine introduction in v1.
- No full CRM/report unified data model redesign in v1.

## 6. Known Limitations

- HTML report branch is a simplified form (not final report UX).
- Some add-on integrations are structurally connected but not yet deeply report-driven.
- CRM <-> essential-report integration currently relies on single-point linkage: `review_inspection_id`.
- Old-inspection fallback is supported, but validated sample coverage is still limited.
- SMS link quality depends on environment base URL configuration (recommended: `INSPECTION_APP_BASE_URL`).

## 7. Stabilization Focus

- Regression coverage across 4 products + add-on combinations.
- SMS chain reliability monitoring (`status -> sent -> link -> open`).
- Data consistency monitoring for `review_inspection_id` backfill success rate.
- Legacy page/path cleanup or explicit experimental labeling.
- Log/exception convergence and operational observability tightening.
- Lightweight UI clarity improvements (non-structural, non-architectural).

## 8. Release Evidence

- Verified sample (runtime):
  - CRM inspection id: `8ca1c334-281b-42cc-a168-29cc17fc1581`
  - EH inspection id: `EH-2026-04-010`
  - `review_inspection_id` backfill: **success**
  - `/api/review/EH-2026-04-010`: **200**
  - `/review/EH-2026-04-010`: **accessible**

