# Phase 3B.2 — Pre / Post Schema Comparison

- Date: 2026-07-18
- Fingerprint: `sha256:69cc4ddcb715dd93338d45a79f6135deef25124af23b069380ccd52e071df9ab`
- Snapshots: `_phase3b2-pre.json` (before deploy) · `_phase3b2-post-fail.json` (after P3005)

## Summary

Deploy failed before DDL. **Pre and post-fail structural snapshots are identical** for CRM and Product OS counts.

| Metric | Pre | Post-fail | Delta |
|---|---:|---:|---|
| All tables | 72 | 72 | 0 |
| CRM tables | 72 | 72 | 0 |
| CRM views | 10 | 10 | 0 |
| Public enums | 0 | 0 | 0 |
| V1 tables | 0 | 0 | 0 |
| V1 enums | 0 | 0 | 0 |
| V1 views | 0 | 0 | 0 |
| `pos2_*` tables | 0 | 0 | 0 |
| Indexes | 368 | 368 | 0 |
| Foreign keys | 96 | 96 | 0 |
| Checks | 383 | 383 | 0 |
| `_prisma_migrations` | absent | absent | none |
| `btree_gist` | false | false | none |

## CRM safety hashes

| Hash | Pre | Post-fail | Match |
|---|---|---|---|
| CRM table names | `sha256:3e7dede0df207d16c830e84b76676988f72fbc0f7f9cdd6c22f1ace526cc7552` | same | **Yes** |
| CRM view names | `sha256:a2943906d23b46d04c268825f742bc25893de3a38b162e072202b2ae64f268d0` | same | **Yes** |
| CRM indexes | `sha256:a367d98a08a68abaf42aed0c934fb247852e01f2766da66da9a6f75695995ef6` | same | **Yes** |
| CRM foreign keys | `sha256:bc76d0b0e3506507ddebaae6f6e48687b2c5f77440e7af4f7942311d075aeff6` | same | **Yes** |
| CRM checks | `sha256:fb192d543edced14888519f824cacdf0e2e82847b62b0da0f046ec7204864d1c` | same | **Yes** |

## CRM structural changes found

**None.**

## CRM data writes

**None** (inventory/status/deploy-attempt used structure/metadata only; no business-table DML).

## Product OS structural result

**Not created** (blocked by P3005).
