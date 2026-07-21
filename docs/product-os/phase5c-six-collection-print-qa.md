# Phase 5C — Six Collection Print Readiness

## Status

**DEV print readiness completed on 2026-07-19.**

In scope: C-01 Entry, C-02 Living, C-03 Kitchen, C-04 Bedroom, C-05 Bathroom and
C-06 Away.

## Approved source

- Source: `Better_Home_Collections_A4_Review_Set_V1.pdf`
- SHA-256: `f16c53443b49d71478732fb94dbb0bcc85a5968e645f286167e918f47123fff8`
- Page mapping: odd pages 1, 3, 5, 7, 9 and 11 contain the approved Collection fronts.

Each derived Hero file is registered in Neon DEV with `publishStatus=APPROVED`,
`approvalStatus=FROZEN`, its own SHA-256, and source metadata identifying the approved
PDF. Registration is guarded by both the source PDF hash and each derivative hash.

## Validation

- Product OS V2 tests: 78/78 passing.
- Product Studio production build: passing.
- All six Collection sheets resolve through the shared Product Read Model.
- Every sheet has two A4 portrait sides and uses the unified print stylesheet.
- Print remains fail-closed for products without an approved Hero.
- Larger body typography and reduced content density are retained.
- Featured Add-ons come from presentation mappings; permitted Add-ons remain available
  to the Configurator without being dumped onto the A4 sheet.

## Release boundary

This clears the six Collection sheets for internal DEV printing and physical sample
review. It does not deploy Product OS V2 or Product Studio to production and does not
approve other Experience or Standalone assets.

The next product step is a physical print proof at 100% scale, followed by either:

1. typography/spacing calibration from the physical proof; or
2. Configurator and unified quote UI using the same Product Read Model.
