# Migration Issue Register

- Date opened: 2026-07-18 (Phase 2)
- Phase 2A decision recording: **2026-07-18**
- Phase 3A engineering: **2026-07-18** — ISSUE-011/013/014/021 resolved in schema/validators (see ADR-008…010)
- Authority: Product Owner decisions are recorded in `product-owner-decision-pack.md`.
  Cursor recommendations are historical only where superseded.
- Status vocabulary: `OPEN` | `NEEDS_SOURCE` | `NEEDS_PRODUCT_OWNER` | `RESOLVED` | `DEFERRED` | `NOT_A_CONFLICT`
- Immutable sources unchanged (hashes in `source-reconciliation/source-snapshot-verification.md`)

---

## Status summary (after Phase 2A)

| Status | Count | IDs |
|---|---:|---|
| RESOLVED | 21 | ISSUE-001…006, 008…010, 012, 015…020, 022, 024, 025 |
| NEEDS_SOURCE | 1 | ISSUE-007 (PO direction approved; assets pending) |
| OPEN | 0 | — |
| RESOLVED (engineering Phase 3A) | 4 | ISSUE-011, 013, 014, 021 |
| NOT_A_CONFLICT | 1 | ISSUE-023 |

\* ISSUE-011, 013, 014, 021 resolved as engineering in Phase 3A (schema/validators/ADR-010). Final source-data code assignment remains an import-phase task under ADR-010.

---

## Issue table

| Issue ID | Severity | Product ID | Product name | Issue category | Source A | Exact value A | Source B | Exact value B | Product fact affected | Downstream systems affected | Recommended resolution (Cursor, historical) | Recommendation rationale | Product Owner decision required | Status | Decision | Decision date | Migration impact | Validation required |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ISSUE-001 | P0 | C-01 | Entry Collection | Capability vs customer claim | A4 Entry | **Door Awareness** | V2.07 Cap/BOM C-01 | No door-contact capability/SKU | Door-state awareness | A4, Website, Configurator, Proposal, Contract | Option A or B | Claim vs BOM gap | Yes — **DEC-001 APPROVED A** | **RESOLVED** | C-01 includes 1 Zigbee door contact; add capability+BOM+link+install assumption at migration | 2026-07-18 | Future C-01 capability + BOM qty 1 + experience link + install assumption (workbook not edited in 2A) | Confirm capability, SKU, Door Awareness fact_reference after import |
| ISSUE-002 | P0 | C-03 | Kitchen Collection | Scope vs BOM | A4 Kitchen | Warm strip under **WORKTOP** | Cap/BOM | Kickboard / WW-STRIP-3 | Warm strip placement | A4, Website, Proposal, Install, Procurement | Align to kickboard | Technical truth | Yes — **DEC-002 APPROVED A+** | **RESOLVED** | Canonical capability `Warm Kickboard Ambient Zone`; WORKTOP must not imply included strip under worktop; worktop lighting separate | 2026-07-18 | Future capability rename + scope/content correction; do not rewrite PDF now | Scope group ↔ capability validation; A4 regen QA |
| ISSUE-003 | P0 | C-05 | Bathroom Collection | Circuit qualifier | A4 Bathroom | “six lighting circuits” | Cap notes | lighting/fan/heating compatible | Circuit compatibility | A4, Website, Proposal, Contract, Install | Mixed-circuit wording | Cap notes stricter | Yes — **DEC-003 APPROVED A** | **RESOLVED** | Up to six compatible circuits (lighting, exhaust fan, heat lamp, compatible heating); not lighting-only; loads subject to electrical/site/scope | 2026-07-18 | Content/scope wording at regen/import | Circuit qualifier present on all customer surfaces |
| ISSUE-004 | P0 | C-06 | Away Collection | Automation gap | A4 Away | **Return Routine** | Automation Library | Leave/Away/Holiday only | Return behaviour | A4, Website, Configurator, Automation | Define or remove | Must not invent automation | Yes — **DEC-004 APPROVED A+** | **RESOLVED** | Formal Return Routine with boundaries (restore purchased Collections only; no new rooms; no unpurchased caps; no auto garage open) | 2026-07-18 | Create automation definition (stable ID, trigger, conditions, actions) at migration/import | Automation export + experience map validate |
| ISSUE-005 | P1 | ALL | Version identity | A4 footer V2.06 | A4 PDF | V2.06 | File/CHANGELOG | V2.07; Master 2.06 | Release stamp | A4, Website, Proposal, Contract, Releases | Unify or separate | Three signals | Yes — **DEC-005 APPROVED** | **RESOLVED** | Canonical Product OS release = **V2.07**; A4 template version stored separately; PDF not altered now | 2026-07-18 | `releases` + template_version fields; footer uses Product OS V2.07 at next regen | Release vs template fields both present |
| ISSUE-006 | P1 | C-01…C-06 | Theme | A4 green | A4 PDF | Unified green | Theme Library | Per-product accents | Theme tokens | A4, Website, Proposal | Channel override | Presentation ≠ accent inventory | Yes — **DEC-006 APPROVED A** | **RESOLVED** | A4 channel theme override; hierarchy brand→channel→product accent→asset; do not overwrite accents | 2026-07-18 | Theme/channel tables + A4 override | Visual QA; accent values unchanged |
| ISSUE-007 | P1 | C-01…C-06 | Images | Approved crops | A4 PDF | Approved heroes | Image Library | Generic `/assets/.../hero.jpg` | Assets | A4, Website, Proposal | Register assets; mark placeholders | Placeholders unsafe | Yes — **DEC-007 APPROVED A** | **NEEDS_SOURCE** | PO direction approved: versioned assets required; placeholders `NOT_APPROVED_FOR_PUBLISH`; no silent fallback | 2026-07-18 | Asset registration blocked until original files supplied | Publish gate fails if placeholder used |
| ISSUE-008 | P0 | ALL | Taxonomy | Master types | V2.07 Master | Bonus, Product Pack, Standalone… | Phase 1 model | Four types only | Classification | All systems | Extend or map | Incomplete model | Yes — **DEC-008 APPROVED revised**; **DEC-013 amends Protection** | **RESOLVED** | Dual-axis kind×role; Protection is included benefit (no product); unlock C-01∧C-06∧E-05; E-05=CCTV E-06=Toilet | 2026-07-18 | Schema dual fields + aliases/benefits + ADR-005/012 | Kind/role constraints; crosswalk tests |
| ISSUE-009 | P1 | C-01…C-06 | Experience map | A4 labels | A4 ~5 titles | Library/Layout | Counts/titles differ | Experience inventory | A4, Website, Configurator | Library=fact; A4=map | Label drift | Yes — **DEC-009 APPROVED A** | **RESOLVED** | Stable Experience IDs + channel presentation mapping; presentation must not invent capability/automation | 2026-07-18 | `experience_presentation_mappings` table | Crosswalk QA per Collection |
| ISSUE-010 | P1 | C-01…C-06 | Relationships | Expand Further | A4 lists | Workbook | No relationships sheet | Cross-sell graph | A4, Website, Configurator, Proposal | Import from A4 lists | Missing source | Yes — **DEC-010 APPROVED A+**; **DEC-013 unlock codes** | **RESOLVED** | A4 Expand Further = initial relationship source; typed relationships; Protection unlock C-01∧C-06∧E-05→included benefit | 2026-07-18 | `product_relationships` + requirements + included_benefits | Every target product_code exists; Protection not a product target |
| ISSUE-011 | P2 | C-01…C-06 | Scope structure | A4 headings | Headed groups | Workbook | Flat capabilities | Scope presentation | A4, Proposal | scope_groups linked to capabilities | Structure not fact | No new PO | **RESOLVED** | Phase 3A: `pos2_scope_groups` / `pos2_scope_items` with required capability FK | 2026-07-18 | Schema ready; labels at import/regen | Group→capability links |
| ISSUE-012 | P2 | ALL | Price display | A4 line | installed incl GST | Pricing | Amount only | Commercial qualifiers | A4, Website, Proposal, Contract | Structured modes | Numbers≠qualifiers | Yes — **DEC-011 APPROVED A** | **RESOLVED** (policy) | Default Collections: installed + GST incl + standard scope + assumptions; qualifiers structured; E-06 (Smart Toilet) supply-only exception | 2026-07-18 | price fields + per-product exceptions | No supply-only product inherits installed incl GST |
| ISSUE-013 | P2 | C-01…C-06 | Content dup | 14 Hero | Matches A4 | Master | Dup hero fields | Hero ownership | A4, Website | Content library authoritative | Ownership | No | **RESOLVED** | Phase 3A: `V2_CONTENT_OWNERSHIP` validator; content_entries authority | 2026-07-18 | Enforce at import | Conflict report |
| ISSUE-014 | P2 | C-01…C-06 | Featured add-ons | A4 order | Featured list | Eligibility | No sort order | Featured presentation | A4, Website, Configurator | featured_addons table | Eligibility≠order | No | **RESOLVED** | Phase 3A: `pos2_product_featured_addons` + sort validator | 2026-07-18 | Sort matches A4 at import | Order QA |
| ISSUE-015 | P1 | C-06 | Away naming | A4 experiences | Return Routine etc. | 05+19 | Different names | Experience identity | A4, Automation, Website | Map + define Return | Drift | Yes — **DEC-004 + DEC-009** | **RESOLVED** | Presentation map + Return Routine automation | 2026-07-18 | Crosswalk + automation | Map ↔ automation IDs |
| ISSUE-016 | P1 | C-01…C-06 | Content coverage | A4 narrative | Full A4 blocks | 14 Library | Hero/Subtitle/Story/Footer only | Customer content | A4, Website | Verbatim A4 migrate | Incomplete 14 | Yes — **DEC-012 APPROVED A** | **RESOLVED** (policy) | Migrate six-Collection A4 copy verbatim into Content Library; individual validation at import | 2026-07-18 | Content kinds + placements | Diff A4 ↔ content_entries |
| ISSUE-017 | P1 | C-01…C-06 | Legacy content | Sheet 12 | Legacy moments | 14 | Incomplete | Legacy-only text | Migration | Inventory; non-canonical | Sheet 12 Legacy | Yes — **DEC-012** | **RESOLVED** (policy) | Sheet 12 Legacy non-authoritative; Legacy-only text not auto-approved | 2026-07-18 | Archive 12; no runtime read | Legacy-only list not auto-published |
| ISSUE-018 | P2 | C-01…C-06 | Layout vs A4 | Layout sheet | Counts/flags | A4 | Experience counts / Expand Further | Layout authority | A4 generator | Derive from presentation map | Drift | Yes — via **DEC-009/010** | **RESOLVED** | Approved A4 presentation mapping is layout authority over Layout sheet drift | 2026-07-18 | Generator uses presentation map + relationships | Visual + count QA |
| ISSUE-019 | P2 | C-03, C-05 | Expand Further CTA | A4 | “Add-ons” CTA | Model | Product↔product only | CTA vs fact | A4, Website | presentation_cta type | CTA≠product | Yes — **DEC-010** | **RESOLVED** | “Add-ons” = `presentation_cta`, not product relationship | 2026-07-18 | CTA rows / layout field | CTA renders without inventing product |
| ISSUE-020 | P2 | C-06 | Layer purity | Install assumptions | Zigbee in customer layer | Layering rules | Customer vs Technical | Protocol in customer copy | A4, Website, Install | Move Zigbee to Technical | Layer leak | Yes — policy with DEC-012 | **RESOLVED** | Zigbee wording → Technical/Installation content; customer assumptions stay non-protocol | 2026-07-18 | Split content layers at migrate | Layer audit |
| ISSUE-021 | P1 | ALL | Stable IDs | Workbook | Product/SKU/AO IDs | Exp/Cap/Rule/Auto/Asset/Rel | No stable codes | Identifier strategy | All systems | Assign at migration | Integrity | Engineering | **RESOLVED** | Phase 3A: `stable-id-strategy.md` + ADR-010; final codes at import | 2026-07-18 | High — import assigns codes | Uniqueness validators |
| ISSUE-022 | P2 | F-01, packs, bonuses | Hierarchy | Master types | Bonus/Pack/Standalone | ADR-001 four-type | Hierarchy rules | Configurator, Proposal | Dual-axis + roles | Incomplete | Yes — **DEC-008** | **RESOLVED** | Kind + commercial_role; Protection bonus rules | 2026-07-18 | Schema + seed classification | Hierarchy/bonus tests |
| ISSUE-023 | P2 | C-06 | Price vs placeholder | Pricing | Away **1499** | Placeholders | e.g. 2499 | Away price | Website, Proposal, Contract | Use V2.07 | Placeholders non-auth | No | **NOT_A_CONFLICT** | Accept V2.07 1499 | 2026-07-18 | None if placeholders unused | Seed uses V2.07 only |
| ISSUE-024 | P2 | ALL | GST/installed fields | Commercial | A4 wording | Pricing | Amount only | Tax/install basis | Pricing, Contract, Proposal | Structured fields | Linked 012 | Yes — **DEC-011** | **RESOLVED** (policy) | Structured qualifiers; E-06 exceptions; validate per product at import | 2026-07-18 | With ISSUE-012 | Commercial checklist |
| ISSUE-025 | P0 | E-05, E-06, Protection | Identity / SSoT | Numbering & surfaces | Workbook Legacy E-05/06/07 | DEC-013 | New canonical IDs + shared read model | Catalogue identity + consumers | Website, Configurator, Quote, A4 | Crosswalk + aliases + read model | Identity collision | Yes — **DEC-013 APPROVED** | **RESOLVED** | E-05=CCTV; E-06=Toilet; no E-07; Protection=included benefit; shared read model; Legacy aliases preserved | 2026-07-18 | `pos2_product_aliases` + `pos2_included_benefits`; migration refreshed unapplied; importer transforms planned | Unit tests DEC-013; no Neon / no import yet |

---

## Approved future fact deltas (workbook unchanged in Phase 2A)

| Ref | Product | Planned change | Source of authority |
|---|---|---|---|
| DELTA-C01-DOOR | C-01 | +1 door-contact capability; +1 Zigbee door-contact SKU qty 1; link Door Awareness; install assumption (mounting + Zigbee) | DEC-001 |
| DELTA-C03-KICK | C-03 | Capability rename to `Warm Kickboard Ambient Zone`; scope/content correction | DEC-002 |
| DELTA-C05-CIRCUIT | C-05 | Compatible-circuit wording (not lighting-only) | DEC-003 |
| DELTA-C06-RETURN | C-06 | Automation `Return Routine` with DEC-004 boundaries | DEC-004 |
| DELTA-PROTECTION-BENEFIT | E-05 CCTV | Protection = included benefit; unlock C-01 ∧ C-06 ∧ E-05; no product ID / price | DEC-013 |
| DELTA-RENUMBER-E | E-05, E-06 | Legacy E-06→E-05 CCTV; Legacy E-07→E-06 Toilet; aliases preserved | DEC-013 |

---

## Known mandated issues checklist
- ISSUE-001…007: recorded with Phase 2A outcomes ✓  
- Additional ISSUE-008…024: recorded ✓  
- ISSUE-007 not fully resolved until approved original image assets exist ✓
