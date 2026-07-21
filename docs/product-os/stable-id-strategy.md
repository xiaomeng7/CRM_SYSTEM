# Product OS V2 — Stable ID Strategy

- Date: 2026-07-18
- Phase: 3A (amended DEC-013 / ADR-012)
- Related: ISSUE-021 → RESOLVED (format); ISSUE-025 → RESOLVED (crosswalk); final source-data assignment deferred to import (Phase 4/5)
- ADR: ADR-010, ADR-012

## Principles

1. Never derive identity from Excel row numbers.
2. Never use mutable display text (titles, hero copy) as identity.
3. Codes remain stable if customer wording changes.
4. Imported codes are deterministic and collision-checked.
5. Case normalization:
   - Product codes: uppercase (`C-01`, `AO-013`)
   - All other stable codes: lowercase (`exp.c01.door_awareness`)
6. Database primary keys are UUIDs; stable codes are unique business keys.
7. **Legacy aliases are preserved** (`pos2_product_aliases`); never silently rewrite historical source snapshots.
8. **Canonical Experience codes after DEC-013:** E-01…E-04 ordinary; **E-05 = CCTV**; **E-06 = Smart Toilet**; **no E-07**; Protection has **no** product code (`benefit.protection_bonus`).

## Formats

| Entity | Format | Example (synthetic) |
|---|---|---|
| Product | `{F\|C\|E\|AO}-##…` | `C-01`, `E-05` (CCTV), `AO-013` |
| Legacy alias | same shape, stored in `pos2_product_aliases` | Legacy `E-06` → canonical E-05 |
| Included benefit | `benefit.{slug}` | `benefit.protection_bonus` |
| Experience | `exp.{productSlug}.{slug}` | `exp.c01.door_awareness` |
| Capability | `cap.{slug}` | `cap.door_contact` |
| Relationship | `rel.{from}.{type}.{toOrCta}` | `rel.e05.bonus_unlock.protection` |
| Rule | `rule.{productOrGlobal}.{slug}` | `rule.c01.lock_compatible` |
| Automation | `auto.{productSlug}.{slug}` | `auto.c06.return_routine` |
| Content entry | `cnt.{productSlug}.{kind}.{slug}` | `cnt.c01.hero.main` |
| Asset | `asset.{slug}.{versionHint}` | `asset.c01.hero.v1` |
| Scope group | `scp.grp.{productSlug}.{slug}` | `scp.grp.c03.kickboard` |
| Scope item | `scp.item.{productSlug}.{slug}` | `scp.item.c03.warm_strip` |
| Price book | `pb.{market}.{slug}` | `pb.au.retail` |
| Price | `price.{product}.{book}.{basis}.{version}` | `price.c01.au.installed.v207` |
| Release | `pos-{major}.{minor}` | `pos-2.07` |
| BOM version | `bom.{product}.{version}` | `bom.c01.2.07` |
| Labour item | `lab.{slug}` | `lab.switch_install` |
| Assumption | `asm.{product}.{slug}` | `asm.c01.door_contact_mount` |
| Presentation map | `map.{channel}.{experienceCode}.{n}` | `map.a4.exp.c01.door_awareness.1` |
| Theme | `theme.{scope}.{slug}` | `theme.channel.a4.brand_green` |

Slug characters: `a-z`, `0-9`, `_`, `.`, `-`.

## Enforcement

- Format checks: `src/v2/stable-ids.js`
- Crosswalk: `src/v2/legacy-crosswalk.js` + `docs/product-os/legacy-id-crosswalk.md`
- Structural validation rule: `V2_STABLE_ID_FORMAT`
- Collision checks at import (Phase 4): unique constraints on code columns + import report
- Reject canonical insert of `E-07` or any Protection product row

## Phase 3A scope

Do **not** assign final Better Home source-data IDs in Phase 3A except synthetic test fixtures clearly marked as non-product facts.
