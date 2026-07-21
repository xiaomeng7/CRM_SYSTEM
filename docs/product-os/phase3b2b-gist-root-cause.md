# Phase 3B.2b — GiST Root Cause

- Date: 2026-07-18
- Status: Root cause confirmed; corrected offline; deployed on rebuilt Neon DEV

## Failure

```text
P3018 / SQLSTATE 42P17
functions in index expression must be marked IMMUTABLE
```

On:

```sql
(("fulfilment_mode")::text) WITH =,
(("tax_basis")::text) WITH =,
```

inside `EXCLUDE USING gist (...)`.

## Why

PostgreSQL enum → text casts are **not IMMUTABLE** (enum labels can be renamed).  
GiST / exclusion index expressions require IMMUTABLE functions.

## Fix

Use native enum equality (supported by `btree_gist`):

```sql
"fulfilment_mode" WITH =,
"tax_basis" WITH =,
```

## Offline proof

- Engine: local disposable PostgreSQL **17.10** (Homebrew), matching Neon major version
- Extension: `btree_gist`
- Result: constraint created; overlap rejected; adjacent/`[)` allowed; different fulfilment/tax allowed; NULL bounds behave as ±infinity; DRAFT / non-visible exempt per WHERE clause
- Cluster destroyed after proof — no persistent data
- Did **not** connect to Neon production
