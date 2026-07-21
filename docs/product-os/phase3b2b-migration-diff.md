# Phase 3B.2b — Migration Diff

- File: `packages/product-os/prisma/migrations/20260718120000_add_product_os_v2_schema/migration.sql`
- Scope: **only** the GiST exclusion enum columns (no other V2 SQL changed)
- Authority: first successful apply of this migration is on rebuilt DEV; production never applied it; prior failed DEV branch deleted

## Checksums

| State | SHA-256 |
|---|---|
| Old (failed on 3B.2a) | `d7d3e8fd0073602d70f19a41af96123a502433a4b8dcfd1a5afb7d87ae835a61` |
| New (3B.2b) | `13ac20736dff5538432987fcb0d5d1518432e9968b8037b96fefd6bd99a31a55` |

Neon DEV applied checksum matches **new** value.

## Exact diff

```diff
-    (("fulfilment_mode")::text) WITH =,
-    (("tax_basis")::text) WITH =,
+    "fulfilment_mode" WITH =,
+    "tax_basis" WITH =,
```

## Product decisions

DEC-013 / ADR-012 product rules **unchanged**. This is an engineering immutability fix for the approved price-overlap exclusion constraint only.

## Regression guard

`tests/v2/phase3b2b-gist-immutability.test.js` forbids the `::text` casts and pins the new checksum.
