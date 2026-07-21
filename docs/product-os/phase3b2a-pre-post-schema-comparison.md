# Phase 3B.2a — Pre / Post Schema Comparison

- Date: 2026-07-18
- Fingerprint: `sha256:69cc4ddcb715dd93338d45a79f6135deef25124af23b069380ccd52e071df9ab`
- Snapshots: `_phase3b2a-pre.json` · `_phase3b2a-post-partial.json`

## CRM safety

| Metric | Pre | Post-partial | Match |
|---|---:|---:|---|
| CRM tables | 72 | 72 | Yes |
| CRM views | 10 | 10 | Yes |
| CRM table-name hash | `sha256:3e7dede0…7552` | same | **Yes** |
| CRM view-name hash | `sha256:a2943906…68d0` | same | **Yes** |
| CRM indexes hash | `sha256:a367d98a…95ef6` | same | **Yes** |
| CRM FK hash | `sha256:bc76d0b0…aeff6` | same | **Yes** |
| CRM checks hash | `sha256:fb192d54…64d1c` | same | **Yes** |

**CRM structural changes: None.**  
**CRM data writes: None.**

## Product OS / totals

| Metric | Pre | Post-partial |
|---|---:|---:|
| All tables | 72 | 89 (=72 CRM + 16 V1 + `_prisma_migrations`) |
| All views | 10 | 11 (+ `product_pricing_summary`) |
| Public enums | 0 | 3 (V1 only) |
| V1 tables | 0 | 16 |
| `pos2_*` tables | 0 | **0** (V2 rolled back) |
| `btree_gist` | false | false |

## Migration history rows

| migration_name | finished_at | applied_steps_count | notes |
|---|---|---:|---|
| `20260708201000_init_product_os` | set | 1 | Applied OK |
| `20260718120000_add_product_os_v2_schema` | null | 0 | Failed (P3018) |
