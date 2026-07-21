# Phase 3B.2b — Neon DEV Branch Rebuild

- Date: 2026-07-18
- Project: `silent-block-70931865` (`CRM-system`)
- Tool: `neonctl` (authenticated); non-interactive `--project-id`

## Deleted branch (failed 3B.2a state)

| Field | Value |
|---|---|
| Name | `product-os-v2-dev` |
| ID | `br-patient-credit-a1ju5yoa` |
| Parent | `br-odd-wildflower-a17or2wa` (`production`) |
| Old fingerprint | `sha256:69cc4ddcb715dd93338d45a79f6135deef25124af23b069380ccd52e071df9ab` |
| Pre-delete V1 | 16 tables applied, empty |
| Pre-delete V2 | failed / `pos2_*` = 0 |
| Pre-delete CRM | 72 / 10; hashes unchanged vs baseline |

Verified name+id match before delete. **Did not delete `production`.**

## Created branch

| Field | Value |
|---|---|
| Name | `product-os-v2-dev` |
| ID | `br-jolly-shape-a1rr3xq3` |
| Parent | `production` (`br-odd-wildflower-a17or2wa`) |
| Note | `--suspend-timeout -1` rejected by account; created with default suspend policy |
| Auto-delete | No `--expires-at` set (no scheduled expiry) |

## Local env update (ignored file)

Updated `crm-system/.env` only:

- `PRODUCT_OS_DEV_DATABASE_URL` → new branch connection (not printed)
- `PRODUCT_OS_DEV_HOST_FINGERPRINT` → `sha256:2dec7eeaf2d657af6298f033bd35c73cab44a1388ff01455859d839516251fec`
- `PRODUCT_OS_DEV_NEON_BRANCH=product-os-v2-dev`

Root `DATABASE_URL` **not** modified. Production Product OS URL **not** configured/used.

## New branch pre-deploy reconciliation

| Check | Result |
|---|---|
| Scenario C clean start | Yes |
| CRM 72/10 | Yes |
| CRM structural hashes | Match prior baseline |
| Product OS V1/V2 | 0 |
| `_prisma_migrations` | Absent |
| Fingerprint ≠ old | Yes |
| Branch id ≠ deleted | Yes |
| Production connections | None |
