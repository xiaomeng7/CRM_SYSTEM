# Inspection Product Mapping (Current State)

This document describes the **current** `inspection_product` behavior in `apps/essential-report`.
Audience: engineering, QA, product, operations.

## Purpose

- Introduce a lightweight product marker (`inspection_product`) into inspection flow and saved raw data.
- Enable first-stage product differentiation via **Wizard step-level display gating** only.
- Keep existing pipeline stable: Wizard -> submitInspection -> prepareSubmissionRaw -> raw storage -> Review display.

Current phase intentionally does **not** include:

- Report branching/template switching by product.
- Backend workflow branching by product.
- Section-level or question-level schema redesign.
- Complex product config DSL.

## Supported Products

- `essential_full`
- `rental_lite`
- `energy_advisory`
- `pre_purchase`

## Current Step List

Wizard steps (`WIZARD_PAGES`) currently include:

1. `job_client`
2. `energy_main_load`
3. `energy_stress`
4. `energy_enhanced`
5. `snapshot_intake`
6. `access`
7. `internal_rooms`
8. `switchboard_rcd`
9. `earthing_external`
10. `other_internal`
11. `assets`
12. `measured`
13. `thermal`
14. `exceptions`
15. `signoff`

## Current Gating Rules (Step Level)

Gating is configured in `apps/essential-report/src/config/inspectionProducts.ts` via `HIDDEN_STEPS_BY_PRODUCT`.

- `essential_full`
  - Hidden steps: none
  - Behavior target: keep full baseline flow unchanged.
- `rental_lite`
  - Hidden steps: `energy_enhanced`, `thermal`
- `energy_advisory`
  - Hidden steps: `thermal`
- `pre_purchase`
  - Hidden steps: `energy_enhanced`

Notes:

- Some candidate steps are intentionally **not hidden yet** (for example `snapshot_intake`, `internal_rooms`, `other_internal`) to avoid accidental flow breakage.
- Rule-of-thumb for this phase: **hide less rather than over-hide**.

## Behaviour Guarantees

- Default product is `essential_full`.
- Unknown/invalid product values normalize back to `essential_full`.
- `ReviewPage` displays inspection product (code + label) for internal verification.
- Gating affects **front-end visible steps only**.
- Existing submit/raw/report pipeline remains intact:
  - no submit contract change,
  - no raw schema redesign,
  - no backend/report decision logic changes.

## Known Limitations

- Gating is currently **step-level only**.
- No section-level or block/question-level gating yet.
- No product-specific report rendering branch yet.
- Product differentiation is intentionally lightweight in this phase.

## Suggested QA Checks (Minimum)

1. `essential_full`:
   - Full step set remains available (except existing gate-based dynamic hides).
   - End-to-end submit remains successful.
2. `rental_lite`:
   - `energy_enhanced` and `thermal` are hidden.
   - Submit flow still works.
3. `energy_advisory`:
   - `thermal` is hidden.
   - Energy-related steps remain visible and submit works.
4. `pre_purchase`:
   - `energy_enhanced` is hidden.
   - Core inspection flow remains submit-ready.
5. Data persistence:
   - `raw.inspection_product` is present after submit for all 4 products.
6. Review display:
   - Product value shown correctly in Review.
7. Backward compatibility:
   - Old records without product value still open normally and fall back safely.

## Source of Truth

- Product config: `apps/essential-report/src/config/inspectionProducts.ts`
- Wizard rendering: `apps/essential-report/src/components/Wizard.tsx`
- Raw normalization fallback: `apps/essential-report/netlify/functions/lib/report/prepareSubmissionRaw.ts`
- Review display: `apps/essential-report/src/components/ReviewPage.tsx`
