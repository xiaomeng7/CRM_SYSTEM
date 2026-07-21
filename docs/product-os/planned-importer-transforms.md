# Planned Importer Transforms (DEC-013) — Pre-import

- Date: 2026-07-18
- Status: **Phase 4A implemented as pure ImportPlan** — still no Neon fact write
- Code:
  - `packages/product-os/src/v2/legacy-crosswalk.js`
  - `packages/product-os/src/v2/import/*` (Phase 4A)
- Design: `docs/product-os/phase4a-import-transform-design.md`
- Detail: `docs/product-os/legacy-id-crosswalk.md`

## Transform order

### Phase 4A (done — offline)

1. Hash-verify immutable sources (`source-fingerprint.js`).
2. Load workbook read-only; skip legacy `12_Product_Card_Content`.
3. For each Master product row, `transformProductMasterRow` / `mapWorkbookProductCode`:
   - Legacy E-05 Protection → `SKIP_TO_BENEFIT` → plan `includedBenefits` + alias; **no** product row.
   - Legacy E-06 CCTV → `UPSERT_PRODUCT` as **E-05**; alias E-06 → product.
   - Legacy E-07 Smart Toilet → `UPSERT_PRODUCT` as **E-06**; alias E-07 → product.
   - Other codes → KEEP with kind×role normalize.
4. Pricing Summary → remapped prices; Protection → `SKIP_PRICE`.
5. Add-ons → parent eligibility remap via `remapParentEligibility`.
6. Attach approved DELTA overlays as `PLANNED` (not executed).
7. Emit ImportPlan IR with `dbWrite: false`.

### Phase 4B+ (gated — not started)

1. Apply ImportPlan to DEV Neon `pos2_*` under guarded env.
2. Remap every remaining FK-like reference (BOM, capabilities, relationships, Expand Further, presentation maps) through `toCanonicalProductCode` / `remapProductCodeTokensInText`.
3. Reject any attempt to insert:
   - product_code `E-07`
   - product named Protection Bonus
   - `commercial_role = BONUS` on a product
4. Seed Protection unlock relationship requirements: C-01 ∧ C-06 ∧ E-05 on host CCTV benefit.
5. Write provenance: alias_system `V2_07_WORKBOOK`, source labels, notes — do not mutate immutable source files.
6. Execute DELTA overlays with PO-approved payloads (still no invented facts).

## Shared read model (post-import consumers)

Website / Configurator / Quote / A4 Print all project from the same Product Page read model
(`product-page-read-model.md`, `src/v2/product-read-model.js`). Print uses `toPrintProductSheet`.

## Explicit non-goals until Phase 4B approval

- No Neon catalogue write
- No production migrate
- No V1 `import-excel.js` for V2 facts
