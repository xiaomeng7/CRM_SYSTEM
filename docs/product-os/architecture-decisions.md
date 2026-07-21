# Product OS V2 — Architecture Decision Records

- Status date: 2026-07-18
- Phase: 1 design + Phase 2A + **DEC-013** (ADR-012) recorded pre-import
- Authority: Product Owner confirmation (D1–D4; DEC-001…**013**)

---

## ADR-001 — Canonical product hierarchy (D1)

**Status:** Accepted (amended 2026-07-18 by ADR-005 / DEC-008; **ADR-012 / DEC-013** SSoT + numbering)  
**Date:** 2026-07-18

### Context
V1 used `product_type` enum values including `INFRASTRUCTURE`, `COLLECTION`, and
`EXPERIENCE_PACK`. Downstream Product Language must use one shared hierarchy for A4,
Website, Configurator, Proposal, Contract, ServiceM8, and technician outputs.

V2.07 Product Master also used Legacy labels `Bonus`, `Product Pack`, and
`Standalone Product`, which cannot be expressed as a single flat type without loss.

### Decision
Canonical commercial hierarchy / workflow remains:

**Foundation → Collection → Experience → Add-on → Quote**

(with **Standalone** as a peer kind that may bypass Foundation — see ADR-005 / ADR-012.)

Product OS is the single read-model source for Website, Configurator, Quote, and A4 Print (ADR-012).

Rules:
- `EXPERIENCE_PACK` is **deprecated** as a canonical product kind; map Legacy source
  value → `EXPERIENCE`.
- Do **not** remove `EXPERIENCE_PACK` from V1 schema immediately.
- Treat `EXPERIENCE_PACK` as a **Legacy compatibility value** until V2 migration and
  validation are complete.
- Product **identity** and **commercial role** are separate axes (ADR-005).
  `Bonus` is a commercial role, not a product kind.
- `Product Pack` is a Legacy source label mapped via commercial role `PACK`.

### Consequences
- New runtime design excludes `EXPERIENCE_PACK` / `Bonus` / `Product Pack` as
  first-class single-axis types.
- Importers map Legacy labels explicitly and record mapping provenance.
- Add-on remains first-class `product_kind = ADDON` with parent eligibility constraints.
- Protection Bonus uses `EXPERIENCE` + `BONUS` with multi-product unlock requirements.

---

## ADR-002 — Existing definition JSON files are placeholders (D2)

**Status:** Accepted  
**Date:** 2026-07-18

### Context
Seven JSON files under `packages/product-os/definitions/` currently drive the V1
definitions → build → snapshot pipeline. They contain placeholder SKUs, zero costs,
and unresolved TODO markers.

### Decision
These files are **placeholder data**, not an approved product-fact baseline.

Allowed uses only:
- understanding the existing pipeline;
- compatibility analysis;
- regression testing;
- identifying fields currently consumed by code.

Forbidden:
- overriding Product OS V2.07 facts;
- silent merge into V2.07 facts;
- treating them as source of truth for names, prices, BOM, scope, eligibility, or
  automation.

After V2 importer completion, approved V2.07 data (plus Phase 2A approved deltas)
replaces placeholders in the V2 read model. Preserve the old files until replacement
is validated.

### Consequences
- Source priority places V2.07 structured facts above placeholder definitions.
- Placeholder retention is mandatory until validation complete.
- No design phase may infer missing product facts from these JSON files.

---

## ADR-003 — Additive normalized V2 schema (D3)

**Status:** Accepted  
**Date:** 2026-07-18

### Context
V1 Product OS schema and pipeline are frozen as Legacy. A destructive rewrite would
risk breaking existing tooling and invalidate governance constraints.

### Decision
Use an **additive, normalized V2 schema**.

Required strategy:
1. Keep V1 tables and pipeline operational as Legacy.
2. Add the normalized V2 Product OS schema.
3. Import and validate V2.07 into V2 (applying approved Phase 2A deltas at import).
4. Build a V2 read model.
5. Compare V1 and V2 outputs.
6. Move consumers to V2 only after approval.
7. Retire Legacy structures in a **separate future phase**.

**No destructive migration is authorized.**  
**Phase 2A does not authorize Prisma/SQL/Neon work** — that remains Phase 3+.

### Consequences
- V1 and V2 coexist until consumer cutover is approved.
- V2 tables must be clearly namespaced / marked.
- Legacy tables are excluded from new runtime design.
- Future retirement of V1 requires a separate approved phase.

---

## ADR-004 — Neon branch and environment safety (D4)

**Status:** Accepted  
**Date:** 2026-07-18

### Context
Neon PostgreSQL is the target platform. Production changes without gates risk
unapproved schema/data mutation.

### Decision
Use a **Neon development branch first**.

Rules:
- No production schema change without explicit human approval.
- No production data import during design and development phases.
- Migration commands must require an **explicit target environment**.
- Scripts must refuse to run against production unless a **separate confirmation
  flag** is supplied.
- Never print `DATABASE_URL`, credentials, tokens, or connection secrets.
- Production deployment is outside current authorization.
- Phase 2A: **do not connect to Neon**.

### Consequences
- Phase 3+ tooling must implement environment targeting and production refuse-by-
  default behaviour.
- Secrets remain outside Git and logs.

---

## ADR-005 — Dual-axis product identity: kind × commercial role (DEC-008)

**Status:** Accepted (amended 2026-07-18 by **ADR-012 / DEC-013**)  
**Date:** 2026-07-18  
**Supersedes:** Phase 1 single-axis four-type assumption; revises ADR-001 typing details  
**Amended by:** ADR-012 — Protection is no longer a catalogue product; numbering renumbered

### Context
V2.07 Product Master mixes structural kinds (Foundation, Collection, Experience Pack,
Standalone) with commercial labels (Bonus, Product Pack). Collapsing these into one
enum either drops Standalone/Bonus semantics or invents incorrect hierarchy.

### Decision
Every catalogue product has two controlled fields:

1. **`product_kind`:** `FOUNDATION` | `COLLECTION` | `EXPERIENCE` | `ADDON` | `STANDALONE`
2. **`commercial_role`:** `STANDARD` | `PACK` (enum may retain `BONUS` historically; **products must not use BONUS** — ADR-012)

Initial classification (**current — DEC-013**):
- F-01 → FOUNDATION + STANDARD
- C-01…C-06 → COLLECTION + STANDARD
- Ordinary Enhancements (E-01…E-04) → EXPERIENCE + STANDARD
- **E-05 CCTV** → EXPERIENCE + PACK
- **E-06 Smart Toilet** → STANDALONE + STANDARD
- Permitted equipment extensions → ADDON + STANDARD
- **Protection Bonus → not a product** (`pos2_included_benefits` / Legacy alias)

Legacy workbook mappings (pre-import; see `legacy-id-crosswalk.md`):
- Experience Pack → EXPERIENCE
- Product Pack → commercial_role PACK
- Legacy E-05 Protection → included benefit (no product code)
- Legacy E-06 CCTV → canonical E-05
- Legacy E-07 Smart Toilet → canonical E-06

**Protection Bonus unlock (authoritative — DEC-013):**
C-01 Entry purchased AND C-06 Away purchased AND **E-05 CCTV** purchased
→ Protection Bonus included on CCTV (not a product unlock target).

Protection constraints:
- not independently purchasable;
- no separate customer price;
- no standalone Product page / A4 sheet / Configurator selectable item;
- fails closed if any prerequisite absent;
- activates approved visible front-entry lighting via CCTV alarm-event capability;
- only through capabilities already present in purchased products.

### Consequences
- Target model and ERD use `product_kinds` + `commercial_roles` lookups.
- Configurator/Proposal must enforce BONUS unlock and PACK semantics.
- Importers must not invent a `BONUS` product_kind.

---

## ADR-006 — Product OS release vs document template version (DEC-005)

**Status:** Accepted  
**Date:** 2026-07-18

### Context
A4 footers showed V2.06 while the Product OS workbook is named/changeloged V2.07.
Document template version and product-data release were conflated.

### Decision
- Canonical **Product OS release** = **V2.07**.
- A4 (and other) **document/template versions** (e.g. A4 Review Set V1) are stored
  separately and must not overwrite Product OS release identity.
- At next approved A4 regeneration, Product OS footer/version reference becomes V2.07.
- Do not alter the approved review PDF retrospectively.

### Consequences
- `releases` (product data) and template/asset version fields are distinct.
- Generators compose both into footers without merging identities.

---

## ADR-007 — Theme hierarchy and A4 channel override (DEC-006)

**Status:** Accepted  
**Date:** 2026-07-18

### Context
Approved A4 Collections use unified brand green; Theme Library stores product accents.

### Decision
Theme resolution hierarchy:
1. global brand tokens
2. channel theme (A4 uses unified Better Home green override)
3. optional product accent
4. individual asset/crop configuration

A4 green must **not** overwrite canonical product accent values. Accents remain
available for Website, Configurator, and other channels.

### Consequences
- Channel themes are first-class; product accents remain authoritative inventory.
- Generators apply channel override without mutating accent rows.

---

## Source priority (recorded with ADRs)

When sources are available under `docs/product-os/source/`:

1. Approved Product Owner decisions (DEC-*) and approved future migration deltas
2. Approved Product OS V2.07 structured product facts (immutable snapshot)
3. Approved A4 Content Mapping Review
4. Approved Collection A4 PDF for presentation verification
5. Legacy database and placeholder definitions for historical comparison only

Conflict rule: if two approved sources conflict, do not choose silently. Create a
Migration Issue Register entry with full provenance. Phase 2A recorded DEC-* close
the known P0/P1 product conflicts; remaining source gaps (e.g. image originals)
stay visible as NEEDS_SOURCE.

---

## Related documents
- `docs/product-os/target-data-model.md`
- `docs/product-os/erd.md`
- `docs/product-os/field-ownership-matrix.md`
- `docs/product-os/open-decisions.md`
- `docs/product-os/product-owner-decision-pack.md`
- `docs/product-os/migration-issue-register.md`
- `AGENTS.md` — Product Definition Protection Rule

---

## ADR-008 — V2 physical namespace via `pos2_` table prefix (IMP-01 / IMP-04)

**Status:** Accepted  
**Date:** 2026-07-18  
**Phase:** 3A

### Context
IMP-01 preferred PostgreSQL schema `product_os_v2`. Prisma multi-schema requires
`previewFeatures` / `schemas` configuration and increases migrate/tooling risk in this
repository (single-schema V1 package, CommonJS, existing deploy scripts).

### Decision
Implement additive V2 tables in the default `public` schema with a consistent **`pos2_`**
physical table prefix and **`Pos2*`** Prisma model/enum names.

Prisma remains the ORM. PostgreSQL remains the database. V1 models are untouched.

### Consequences
- Clear name isolation without multi-schema complexity.
- Future move into a dedicated PG schema remains possible via a later additive migration.
- All V2 SQL is greppable via `pos2_` / `Pos2`.

---

## ADR-009 — Add-on modelling and unified prices (IMP-02 / IMP-03)

**Status:** Accepted  
**Date:** 2026-07-18

### Decision
- Add-ons are `Pos2Product` rows with `product_kind = ADDON`.
- `pos2_addon_profiles` holds extends-capability, optional SKU expansion, scope unit,
  and hard CHECKs `creates_new_room = false`, `creates_new_experience = false`.
- Parent eligibility is `pos2_addon_parent_eligibility`.
- Featured presentation is `pos2_product_featured_addons` (ISSUE-014).
- All customer prices (including Add-ons) live in `pos2_product_prices` (unified).

Semantic rule “parent must already include extended capability” is enforced by
application validators (`V2_ADDON_PARENT_HAS_CAPABILITY`) plus FKs/uniques.

---

## ADR-010 — Stable ID strategy (IMP-06 / ISSUE-021)

**Status:** Accepted  
**Date:** 2026-07-18

### Decision
Adopt formats in `docs/product-os/stable-id-strategy.md`.
UUID primary keys + unique business codes. No Excel row identities. Case rules:
product codes uppercase; other codes lowercase.

Final Better Home source-data code assignment occurs at import (Phase 4/5), not Phase 3A.

---

## ADR-011 — Database environment safety for Product OS commands (SAFE-01…03)

**Status:** Accepted  
**Date:** 2026-07-18

### Decision
- Require explicit `PRODUCT_OS_DATABASE_ENV` (`local` | `neon_dev` | `production`).
- Prefer URLs: `PRODUCT_OS_DEV_DATABASE_URL`, `PRODUCT_OS_PROD_DATABASE_URL`
  (optional `PRODUCT_OS_LOCAL_DATABASE_URL`).
- Never treat root `DATABASE_URL` as implicitly safe for Product OS V2 mutations.
- Production requires `--i-understand-production`.
- Never print connection strings; logs may include env name + host fingerprint only.
- `pnpm prisma:migrate` is guarded and **aborts in Phase 3A without connecting**.

### Consequences
Phase 3B may execute migrate against Neon DEV after approval using the guarded path
with `connect` enabled in a future script revision.

---

## ADR-011a — Phase 3A.1 hardened migrate runner and fingerprints

**Status:** Accepted  
**Date:** 2026-07-18  
**Amends:** ADR-011

### Decision
- Remove all committed unguarded `prisma migrate deploy` package scripts.
- Guarded runner modes: `preflight` (no DB), `status` (read-only migrate status), `deploy` (requires `--execute-approved-migration`).
- URL resolution: exact Product OS env vars only; **no local→dev fallback**; never root `DATABASE_URL`.
- Identity: SHA-256 fingerprint of `host|port|database`; require approved fingerprint for `neon_dev` and `production`.
- Production: `--i-understand-production` **and** exact confirm `DEPLOY_PRODUCT_OS_TO_PRODUCTION`.
- Child process: allowlisted Prisma argv; sanitized env; no shell; no secret logging.
- Price ACTIVE overlap: PostgreSQL GiST exclusion (Approach A) + app validators.

### Consequences
Phase 3B may run status/deploy against Neon DEV after approval and fingerprint capture.

---

## ADR-012 — Product OS as SSoT for Website, Configurator, Quote, A4 + identifier renumber (DEC-013)

**Status:** Accepted  
**Date:** 2026-07-18  
**Amends:** ADR-005 (Protection no longer a catalogue product); ADR-001 hierarchy consumers

### Context
Product Owner requires Product OS to be the single source of truth for the sales website,
Configurator, quote engine, and A4 print engine. Legacy workbook numbering used
E-05 Protection Bonus, E-06 CCTV, E-07 Smart Toilet. Protection must not remain an
independently numbered, purchasable product.

### Decision

#### Shared customer workflow
Canonical flow: **Foundation → Collection → Experience → Add-on → Quote**

1. Foundation selected once per Better Home project unless product is Standalone.
2. Collections selected by room/area with quantity.
3. Experiences shown only when dependencies are satisfied.
4. Add-ons appear only inside an eligible parent Collection or Experience.
5. Add-ons cannot create a room, Collection, or Experience.
6. Quotes use current approved structured price records only.
7. Every Collection and Experience page provides Print Product Sheet.
8. Website, Configurator, Quote, and Print consume the **same** Product OS read model.
9. No customer-facing page may hardcode product facts or prices.

#### Canonical numbering
| Canonical code | Product | Kind × role |
|---|---|---|
| E-05 | CCTV | EXPERIENCE + PACK |
| E-06 | Smart Toilet | STANDALONE + STANDARD |

Protection Bonus has **no** canonical Product ID.

#### Legacy crosswalk (provenance preserved; no silent rewrite)
| Legacy | Resolution |
|---|---|
| E-05 Protection Bonus | `INCLUDED_BENEFIT` → `benefit.protection_bonus` hosted on CCTV (canonical E-05) |
| E-06 CCTV | `PRODUCT` → canonical **E-05** |
| E-07 Smart Toilet | `PRODUCT` → canonical **E-06** |

Stored in `pos2_product_aliases` (+ `pos2_included_benefits`).

#### Protection Bonus behaviour
Not independently purchasable, priced, paged, printed as its own sheet, or selectable.
Displayed on CCTV. Unlock: **C-01 ∧ C-06 ∧ E-05 (CCTV)** → included automatically
(`Protection Bonus Included`, quote $0 if useful, concise A4 note).

Represent via capabilities / included benefit / relationship unlock — not a product row.
`commercial_role = BONUS` is **not** a valid product combination in the DB CHECK.

### Consequences
- Unapplied V2 migration revised in-place to add alias/benefit tables and tighten kind×role CHECK.
- Importer must apply crosswalk transforms before insert; never import Legacy E-05 as a product.
- Shared read-model contract in `src/v2/product-read-model.js` and docs.
