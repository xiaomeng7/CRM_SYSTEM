# Product Owner Decision Pack — Phase 2 / 2A

- Pack opened: 2026-07-18 (Phase 2)
- Decisions recorded: **2026-07-18** (Phase 2A)
- Status: **Thirteen decisions recorded (DEC-001…013).** Neon deploy / fact import not started.
- Rule: Approved Product Owner facts below supersede prior Cursor recommendations.
  Recommendations remain visible for audit; they are not authority.

---

## Decision index

| ID | Status | Decision date | Linked issues |
|---|---|---|---|
| DEC-001 | **APPROVED** — Option A | 2026-07-18 | ISSUE-001 → RESOLVED |
| DEC-002 | **APPROVED** — Option A + clarification | 2026-07-18 | ISSUE-002 → RESOLVED |
| DEC-003 | **APPROVED** — Option A | 2026-07-18 | ISSUE-003 → RESOLVED |
| DEC-004 | **APPROVED** — Option A + product boundary | 2026-07-18 | ISSUE-004, ISSUE-015 → RESOLVED |
| DEC-005 | **APPROVED** | 2026-07-18 | ISSUE-005 → RESOLVED |
| DEC-006 | **APPROVED** — Option A | 2026-07-18 | ISSUE-006 → RESOLVED |
| DEC-007 | **APPROVED** — Option A | 2026-07-18 | ISSUE-007 → NEEDS_SOURCE (direction approved) |
| DEC-008 | **APPROVED** — revised dual-axis model (**amended by DEC-013**) | 2026-07-18 | ISSUE-008, ISSUE-022 → RESOLVED |
| DEC-009 | **APPROVED** — Option A | 2026-07-18 | ISSUE-009 → RESOLVED |
| DEC-010 | **APPROVED** — Option A + boundaries (**amended by DEC-013**) | 2026-07-18 | ISSUE-010, ISSUE-019 → RESOLVED |
| DEC-011 | **APPROVED** — Option A (**Smart Toilet code → E-06 via DEC-013**) | 2026-07-18 | ISSUE-012, ISSUE-024 → RESOLVED (policy) |
| DEC-012 | **APPROVED** — Option A | 2026-07-18 | ISSUE-016, ISSUE-017 → RESOLVED (policy) |
| DEC-013 | **APPROVED** — Product OS SSoT + numbering + Protection benefit | 2026-07-18 | ISSUE-025 → RESOLVED; amends DEC-008/010 |

Also closed via these decisions: ISSUE-018, ISSUE-020 (see issue register).

---

## DEC-001 — Entry Collection “Door Awareness”

**Status:** APPROVED — Option A  
**Decision date:** 2026-07-18

### Original question / evidence (preserved)
Customer A4 claims Door Awareness; V2.07 Capability/BOM for C-01 had no door-contact.

### Product Owner decision (authority)
Entry Collection **includes one wireless Zigbee door contact sensor** for the main entry.

Purpose:
- real open/closed door-state awareness;
- support approved Door Awareness experience;
- keep customer content, capability and BOM aligned.

### Prior Cursor recommendation (superseded)
Option B (revise claim) — **not adopted**.

### Planned future migration changes (do **not** edit workbook in Phase 2A)
1. Add one door-contact capability to C-01.
2. Add one approved Zigbee door-contact SKU, quantity **1**, to C-01 BOM.
3. Link Door Awareness experience to that capability.
4. Add installation assumption: suitable mounting + Zigbee connectivity.

**Migration impact:** Import/seed delta after Phase 3 schema; validate Door Awareness fact_reference.  
**Linked issue:** ISSUE-001 → RESOLVED (future BOM/capability addition required).

---

## DEC-002 — Kitchen warm strip: Worktop vs Kickboard

**Status:** APPROVED — Option A with clarification  
**Decision date:** 2026-07-18

### Original evidence (preserved)
A4 WORKTOP group vs Capability/BOM Kickboard.

### Product Owner decision (authority)
The standard warm dimmable ambient strip in Kitchen Collection is a **kickboard strip**.

- Canonical capability name: **`Warm Kickboard Ambient Zone`**
- A4 WORKTOP grouping must **not** imply the included warm strip is installed under the worktop.
- Worktop lighting = lighting-circuit control where compatible; **separate** from included kickboard ambient strip.

### Prior Cursor recommendation
Option A — **adopted with naming clarification**.

### Planned future migration changes
- Rename/normalize capability to `Warm Kickboard Ambient Zone`.
- Correct scope/content grouping so WORKTOP does not claim the included strip.
- Do **not** rewrite approved PDF now; apply at next approved content/scope regeneration.

**Linked issue:** ISSUE-002 → RESOLVED.

---

## DEC-003 — Bathroom circuit wording

**Status:** APPROVED — Option A  
**Decision date:** 2026-07-18

### Product Owner decision (authority)
Bathroom Collection provides control for **up to six compatible circuits**, which may include:
- lighting;
- exhaust fan;
- heat lamp;
- compatible bathroom heating equipment.

Must **not** be described as six lighting-only circuits.  
Actual connected loads remain subject to electrical compatibility, site conditions and installation scope.

**Linked issue:** ISSUE-003 → RESOLVED.

---

## DEC-004 — Away Return Routine

**Status:** APPROVED — Option A with product boundary  
**Decision date:** 2026-07-18

### Product Owner decision (authority)
Away Collection includes a formal **Return Routine**.

Return Routine restores the home from Away state to the normal state of **already purchased and configured Collections**.

It:
- may disarm or exit Away mode;
- may restore normal Collection behaviour;
- may restore appropriate existing lighting or comfort states;
- must **not** create new room control;
- must **not** control rooms or capabilities the customer has not purchased;
- must **not** automatically open the garage door.

### Planned future migration changes
Create Automation definition with stable ID, trigger, conditions and actions during migration/import (not Phase 2A). Suggested placeholder code for planning: `auto.c06.return_routine` (final code assigned at import).

**Linked issues:** ISSUE-004 → RESOLVED; ISSUE-015 → RESOLVED (with DEC-009).

---

## DEC-005 — Product OS release vs A4 template version

**Status:** APPROVED  
**Decision date:** 2026-07-18

### Product Owner decision (authority)
Canonical **Product OS release is V2.07**.

At next approved A4 regeneration:
- Product OS footer/version reference → **V2.07**;
- A4 document/template may retain separate asset/template version (e.g. A4 Review Set V1);
- product-data release and document-template version **stored separately**.

Do **not** alter the approved review PDF now.

**Linked issue:** ISSUE-005 → RESOLVED.

---

## DEC-006 — A4 theme override

**Status:** APPROVED — Option A  
**Decision date:** 2026-07-18

### Product Owner decision (authority)
A4 Collection sheets use unified Better Home brand green via **A4 channel theme override**.  
Product-specific accents remain for other channels (Website, Configurator).

Theme hierarchy:
1. global brand tokens  
2. channel theme  
3. optional product accent  
4. individual asset/crop configuration  

A4 green must **not** overwrite canonical product accent values.

**Linked issue:** ISSUE-006 → RESOLVED.

---

## DEC-007 — Approved Collection images

**Status:** APPROVED — Option A (assets still required)  
**Decision date:** 2026-07-18

### Product Owner decision (authority)
Approved Collection hero images and crops must be registered as **versioned assets**.  
Generic Image Library paths are placeholders marked **`NOT_APPROVED_FOR_PUBLISH`**.  
No customer-facing generator may silently fall back to a placeholder.

If originals are not yet available, keep ISSUE-007 **NEEDS_SOURCE** while recording this decision as approved.

**Linked issue:** ISSUE-007 → NEEDS_SOURCE (PO direction approved; not fully resolved).

---

## DEC-008 — Dual-axis product identity

**Status:** APPROVED — revised model (not original Option A or B); **amended by DEC-013 / ADR-012**  
**Decision date:** 2026-07-18  
**ADR:** ADR-001 amended; **ADR-005** added; numbering/Protection amended by **ADR-012**.

### Product Owner decision (authority)
Separate **product identity** from **commercial role**.

**Canonical `product_kind`:**
- `FOUNDATION`
- `COLLECTION`
- `EXPERIENCE`
- `ADDON`
- `STANDALONE`

**Canonical `commercial_role` on products:**
- `STANDARD`
- `PACK`  
(`BONUS` is **not** assigned to product rows after DEC-013.)

**Initial classification (current — DEC-013):**

| Product | product_kind | commercial_role |
|---|---|---|
| F-01 Foundation | FOUNDATION | STANDARD |
| C-01…C-06 Collections | COLLECTION | STANDARD |
| Ordinary Enhancements | EXPERIENCE | STANDARD |
| **E-05 CCTV** | EXPERIENCE | PACK |
| **E-06 Smart Toilet** | STANDALONE | STANDARD |
| Permitted equipment extensions | ADDON | STANDARD |

Legacy source mappings:
- `Experience Pack` → `EXPERIENCE` (kind)
- `Product Pack` → commercial role `PACK`
- Legacy Protection / CCTV / Toilet codes → see DEC-013 crosswalk (not imported as old IDs)

**Protection Bonus unlock rule (DEC-013):**
```
Entry purchased AND Away purchased AND CCTV purchased
→ Protection Bonus included on CCTV
```
i.e. C-01 ∧ C-06 ∧ **E-05 (CCTV)** → included benefit (no Protection product ID)

Protection:
- cannot be purchased independently;
- has no separate customer price;
- does not unlock if any prerequisite absent;
- uses CCTV alarm-event capability to activate approved visible front-entry lighting behaviour;
- must operate only through capabilities already present in purchased products.

**Linked issues:** ISSUE-008, ISSUE-022 → RESOLVED.

---

## DEC-009 — Experience Library vs A4 presentation

**Status:** APPROVED — Option A  
**Decision date:** 2026-07-18

### Product Owner decision (authority)
Experience Library = canonical product experiences.  
A4 titles/groupings = **presentation mappings**.

Require stable Experience IDs + channel presentation mapping storing:
channel, surface, side, display title, customer description, sort order, grouping, visibility, linked canonical Experience ID, optional linked Automation ID.

A presentation label must **not** create an unsupported capability or automation.

**Linked issue:** ISSUE-009 → RESOLVED; supports ISSUE-015, ISSUE-018.

---

## DEC-010 — Expand Further relationships

**Status:** APPROVED — Option A with boundaries  
**Decision date:** 2026-07-18

### Product Owner decision (authority)
Approved A4 Expand Further lists = **initial Collection relationship source**.  
Validate every target is a real canonical product before import.

Relationship types must distinguish:
- `compatible_experience`
- `recommended_next_product`
- `prerequisite`
- `bonus_prerequisite`
- `bonus_unlock`
- `presentation_cta`

“Add-ons” in Expand Further = **presentation CTA**, not a product relationship / product fact.

Protection Bonus dependency exactly: **C-01 ∧ C-06 ∧ E-05 (CCTV) → Protection included benefit** (DEC-013).

**Linked issues:** ISSUE-010, ISSUE-019 → RESOLVED.

---

## DEC-011 — Price commercial basis

**Status:** APPROVED — Option A  
**Decision date:** 2026-07-18

### Product Owner decision (authority)
Default Collection price basis:
- installed;
- GST inclusive;
- defined standard scope;
- subject to recorded installation assumptions.

Do **not** build display wording into the numeric price field.  
Store structured commercial qualifiers. Exceptions per price record.

**Smart Toilet (E-06, formerly Legacy E-07) exception:**
- independently purchasable;
- supply-only unless separately quoted;
- plumber installation excluded;
- freight excluded (paid by customer);
- optional electrical supply work quoted separately;
- GST basis follows approved Product OS price record.

No product may inherit “installed incl GST” when its price basis is supply-only.

**Linked issues:** ISSUE-012, ISSUE-024 → RESOLVED at policy level; per-product validation at import.

---

## DEC-012 — A4 customer copy migration

**Status:** APPROVED — Option A  
**Decision date:** 2026-07-18

### Product Owner decision (authority)
Migrate approved six-Collection A4 customer copy **verbatim** into new Content Library structure, including:
hero, subtitle, story title/body, front moments+captions, problem, Better Home response, customer experience presentation, installation-assumption customer wording, product-specific footer where applicable.

Rules:
- approved A4 copy = Customer Content;
- BOM/pricing/rules/capabilities remain Product/Technical facts;
- customer copy may reference facts but not redefine them;
- Sheet 12 remains Legacy non-authoritative;
- Legacy-only text must not become approved automatically;
- preserve exact wording unless a linked PO decision requires correction (e.g. DEC-002/003 scope wording at regeneration).

**Linked issues:** ISSUE-016, ISSUE-017 → RESOLVED at ownership/migration-policy level; individual content validation still required at import.

---

## DEC-013 — Product OS as SSoT + canonical numbering + Protection benefit

**Status:** APPROVED  
**Decision date:** 2026-07-18  
**ADR:** ADR-012  
**Amends:** DEC-008, DEC-010 (Protection identity / unlock target numbering)

### Product Owner decision (authority)

Product OS is the **single source of truth** for sales website, Configurator, quote engine, and A4 print engine.

**Canonical customer workflow:** Foundation → Collection → Experience → Add-on → Quote  
(Foundation once unless Standalone; Collections by room+qty; Experiences when deps met; Add-ons only under eligible parents; shared read model; no hardcoded customer facts/prices.)

**Canonical identifiers:**
| Code | Product |
|---|---|
| E-05 | CCTV |
| E-06 | Smart Toilet |

Protection Bonus has **no** Product ID.

**Legacy crosswalk (provenance preserved):**
| Legacy | Resolution |
|---|---|
| E-05 Protection Bonus | included benefit `benefit.protection_bonus` on CCTV; no product code |
| E-06 CCTV | canonical **E-05** |
| E-07 Smart Toilet | canonical **E-06** |

**Protection:** not purchasable / priced / paged / printable as own sheet / Configurator-selectable.  
Displayed on CCTV. Unlock: Entry ∧ Away ∧ CCTV → included automatically.

**Linked issue:** ISSUE-025 → RESOLVED (pre-import recording + schema/tests).

---

## Decisions intentionally NOT in this pack (unchanged)

Engineering IMP-* / SAFE-* remain in `open-decisions.md` (namespace, ORM, Neon gates).
