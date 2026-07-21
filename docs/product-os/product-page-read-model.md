# Shared Product Page Read Model (ADR-012)

- Date: 2026-07-18
- Consumers: Sales Website, Configurator, Quote engine, A4 Print engine
- Rule: **one** Product OS read model; no hardcoded customer-facing product facts or prices

## Canonical workflow

`Foundation → Collection → Experience → Add-on → Quote`

## Required fields

| Field | Notes |
|---|---|
| productId / productCode / canonicalName | Stable identity |
| productKind / commercialRole | Dual-axis |
| hierarchy | Foundation requirement; Standalone bypass |
| hero + approved customer content | Content library |
| customerExperiences | With dependency visibility |
| standardScope / includedCapabilities | Product language |
| compatibleExperiences | Relationships |
| permittedAddons (+ experience promise) | Eligibility filtered |
| dependencyState | For Experiences / Expand Further |
| installationAssumptions | Customer layer |
| activePrice + taxBasis + fulfilmentMode | Structured price records |
| approvedImage / themeLayout | Assets; reject unapproved publish |
| printEligible | Collections & Experiences provide Print Product Sheet |
| standalone / quantityRules | Configurator |
| releaseVersion | Product OS release ≠ template version |
| includedBenefits | e.g. Protection Bonus on CCTV (not a product) |

## Surfaces

| Surface | Behaviour |
|---|---|
| Website product page | Full read model |
| Configurator | Same model + eligibility/dependency filters |
| Quote | Same price + included benefits ($0 bonus if useful) |
| A4 Print Product Sheet | `toPrintProductSheet(readModel)` — **same object**, not a fork |

## Code

- Contract/helpers: `packages/product-os/src/v2/product-read-model.js`
- Not an HTTP API in this phase (pre-deployment design + tests only)
