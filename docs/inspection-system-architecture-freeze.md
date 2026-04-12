# Inspection System Architecture Freeze

Status: Frozen baseline for the current phase.

## Scope and Single Mainline

- The only inspection execution mainline is `apps/essential-report`.
- Product differentiation must be implemented only through:
  - `inspection_product`
  - `selected_addons`
- `Wizard` is the only execution engine for technician inspection flow.
- `ReviewPage` is the only execution verification layer for the same inspection lifecycle.
- `raw.resolved_steps` is the execution fact for each inspection record.
- `ReviewPage` must display `raw.resolved_steps` first; only fallback to real-time calculation for legacy records without this field.

## Report Path Freeze

- `essential_full` uses the Word report path.
- Non-`essential_full` products use the HTML report path.
- This split is a runtime report selection rule, not a separate inspection flow.

## Architecture Constraints (Must Follow)

- Do not add independent rental/pre-purchase/energy inspection pages.
- Do not duplicate `Wizard` or create parallel inspection pipelines.
- Do not create product-specific standalone submit/review flows outside `apps/essential-report`.
- Keep product behavior inside the existing execution mapping layer:
  - `inspection_product` + `selected_addons` -> semantic steps -> wizard step ids.

## Allowed Changes in This Phase

- Refinements inside `apps/essential-report` mainline only.
- Mapping/config evolution for product/add-on execution semantics.
- Review consistency updates that reuse the same resolved execution steps.

## Explicitly Out of Scope

- New standalone inspection apps/pages for rental, pre-purchase, or energy.
- Any parallel flow that bypasses `apps/essential-report` Wizard + Review lifecycle.
- Landing-page driven custom inspection execution engines.
