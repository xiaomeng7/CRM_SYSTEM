# Phase 3A Migration Review — `add_product_os_v2_schema`

- Date: 2026-07-18
- Migration: `packages/product-os/prisma/migrations/20260718120000_add_product_os_v2_schema/migration.sql`
- Method: `prisma migrate diff` (V1-only schema → full schema) + supplemental CHECK/partial unique SQL
- Execution status: **NOT applied** (Phase 3A / 3A.1; no Neon connection)
- Phase 3A.1: migration SQL refreshed **in-place** because it has never been applied anywhere; still named `20260718120000_add_product_os_v2_schema`.

## Summary

| Metric | Count |
|---|---:|
| New PostgreSQL enums (`Pos2*`) | 18 |
| New tables (`pos2_*`) | 50 |
| Foreign keys | 64 |
| Indexes (incl. unique) | ~70+ |
| Supplemental CHECK / partial unique | 7 |
| V1 tables altered | **0** |
| V1 enums altered | **0** |
| Product fact seeds | **0** |

## Engineering decisions applied

| ID | Decision |
|---|---|
| ADR-008 / IMP-01 / IMP-04 | `pos2_` prefixed tables in default `public` schema (not Prisma multi-schema) |
| ADR-009 / IMP-02 / IMP-03 | Add-ons are `Pos2Product` (kind=ADDON) + `pos2_addon_profiles`; prices unified in `pos2_product_prices` |
| ADR-010 / ISSUE-021 | Stable code formats documented; UUID PKs + unique business codes |
| ADR-011 / SAFE-* | Env guard; migrate script refuses Phase 3A execute; never print secrets |
| ISSUE-011 | `pos2_scope_groups` / `pos2_scope_items` with required capability FK |
| ISSUE-013 | Content ownership enforced by validators (`V2_CONTENT_OWNERSHIP`) |
| ISSUE-014 | `pos2_product_featured_addons` with channel/surface/sortOrder |

## Naming & V1 interaction

- All V2 physical objects use `pos2_` / `Pos2` prefixes.
- No FK from V2 tables into V1 tables.
- V1 repository/service (`src/index.js`) unchanged; V2 boundary is `src/v2/`.
- Placeholder `definitions/*.json` are not seeded into V2.

## Delete / update behaviour (pattern)

| Pattern | Policy |
|---|---|
| Child of product (versions, capabilities, content placements, etc.) | `ON DELETE CASCADE` from product |
| Catalogue references (capability, SKU, automation definition) | `ON DELETE RESTRICT` when referenced by inclusions/BOM |
| Optional links (crop, provenance, supersedes) | `ON DELETE SET NULL` |
| Release components | `ON DELETE CASCADE` from release |

## Sensitive fields

- Monetary: `Decimal(12,2)` / `Decimal(12,3)` — never float
- Timestamps: `Timestamptz(6)`
- JSON limited to: automation params, layout definition, crop box, exception meta, import stats, audit before/after
- No secrets columns; connection URLs never stored

## Expected data volume (order of magnitude)

| Area | Expected rows (initial import) |
|---|---|
| Products + add-ons | ~50–80 |
| Capabilities / experiences | hundreds |
| BOM/labour lines | hundreds |
| Content entries | hundreds–low thousands |
| Assets | tens–low hundreds |
| Governance / issues | tens |

## Per-table catalogue

### Product catalogue
| Table | Purpose | PK | Notable uniques / FKs |
|---|---|---|---|
| `pos2_products` | Dual-axis catalogue | UUID | `product_code`; (`canonical_name`,`product_kind`); parent self-FK |
| `pos2_product_versions` | Product language versions | UUID | (`product_id`,`version_label`) |
| `pos2_releases` | Product OS release cuts | UUID | `release_code` |
| `pos2_release_components` | Release composition | UUID | (`release_id`,`component_kind`,`component_id`) |
| `pos2_addon_profiles` | ADDON subtype | `product_id` | extends capability RESTRICT; CHECK no new room/experience |
| `pos2_addon_parent_eligibility` | Parent eligibility | UUID | (`addon_product_id`,`parent_product_id`) |
| `pos2_product_featured_addons` | Featured order by channel | UUID | (`parent`,`addon`,`channel`,`surface`) |
| `pos2_installation_assumptions` | Install assumptions | UUID | (`product_id`,`assumption_code`) |

### Capabilities / relationships / experiences
| Table | Purpose | Notes |
|---|---|---|
| `pos2_capabilities` | Capability catalogue | `capability_code` unique |
| `pos2_product_capabilities` | Product inclusions | unique product+capability |
| `pos2_capability_support_links` | BOM/rule evidence | optional FKs |
| `pos2_product_relationships` | Typed relationships | supports null `to` for CTA; no-self CHECK; bonus unlock partial unique |
| `pos2_relationship_requirement_groups` | AND/OR groups | Protection-style AND |
| `pos2_relationship_requirements` | Required products | unique group+product |
| `pos2_experiences` | Canonical experiences | `experience_code` |
| `pos2_experience_presentation_mappings` | Channel presentation | links experience; optional automation |

### Scope / BOM / labour
| Table | Purpose | Notes |
|---|---|---|
| `pos2_scope_groups` / `pos2_scope_items` | Standard scope | item **requires** capability FK (heading ≠ capability) |
| `pos2_equipment_skus` | SKU catalogue | `sku_code` |
| `pos2_bom_versions` / `pos2_bom_items` | Versioned BOM | qty > 0 CHECK; independent of content versions |
| `pos2_labour_library` / versions / items | Labour | qty > 0 CHECK |

### Rules / automation
| Table | Purpose | Notes |
|---|---|---|
| `pos2_rule_definitions` | Rules | `rule_code` |
| `pos2_automation_definitions` | Automations | `automation_code`; `boundary_notes` for Return Routine |
| `pos2_product_automations` | Attach to products | |
| `pos2_automation_triggers/conditions/actions` | Structured steps | optional JSON `params` only |

### Pricing / content / assets / presentation
| Table | Purpose | Notes |
|---|---|---|
| `pos2_price_books` / `pos2_product_prices` | Prices | decimal amounts; display≠amount; supply-only CHECK |
| `pos2_content_entries` / placements | Customer content | A4 kinds as enum |
| `pos2_image_assets` / crops / links | Assets | `NOT_APPROVED_FOR_PUBLISH` default |
| `pos2_themes` / tokens | Theme hierarchy | GLOBAL/CHANNEL/PRODUCT |
| `pos2_layout_*` / `pos2_footer_configs` / `pos2_document_template_versions` | Presentation | release ≠ template version |

### Governance
| Table | Purpose |
|---|---|
| `pos2_source_snapshots` | Immutable source hash registry |
| `pos2_import_batches` | Import runs |
| `pos2_source_provenance` | Row-level provenance |
| `pos2_validation_runs` / `pos2_validation_results` | Validator persistence |
| `pos2_migration_issues` | Issue register |
| `pos2_audit_log` | Mutation audit |

## Rollback consideration

See `phase3a-recovery-plan.md`. Dropping `pos2_*` / `Pos2*` objects leaves V1 intact.

## Review checklist

- [x] Additive only
- [x] No product fact seed
- [x] Dual-axis enums present
- [x] Protection AND groups structurally representable
- [x] SQL reviewable in repo
- [ ] Applied to Neon (deferred Phase 3B)
