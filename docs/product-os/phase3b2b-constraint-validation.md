# Phase 3B.2b — Constraint Validation

- Date: 2026-07-18
- Target fingerprint: `sha256:2dec7eeaf2d657af6298f033bd35c73cab44a1388ff01455859d839516251fec`
- Runner: `scripts/phase3b2a-constraint-tests.js` (SAVEPOINT per negative test; final `ROLLBACK`)

## Results

| Test | Result | Detail |
|---|---|---|
| kind × role illegal EXPERIENCE+BONUS | Pass | SQLSTATE 23514 |
| ACTIVE price overlap (GiST) | Pass | SQLSTATE 23P01 |
| Adjacent `[)` intervals | Pass | inserted |
| Different fulfilment_mode same window | Pass | inserted |
| Different tax_basis same window | Pass | inserted |
| NULL `effective_to` (+∞) overlap | Pass | SQLSTATE 23P01 |
| DRAFT overlap with ACTIVE | Pass | inserted (WHERE exempt) |
| `customer_visible=false` overlap | Pass | inserted (WHERE exempt) |
| `effective_to <= effective_from` | Pass | SQLSTATE 23514 |
| CONTACT with amount | Pass | SQLSTATE 23514 |
| SUPPLY_ONLY with installation_included=true | Pass | SQLSTATE 23514 |
| Self relationship | Pass | SQLSTATE 23514 |
| Add-on creates_new_room | Pass | SQLSTATE 23514 |
| Add-on creates_new_experience | Pass | SQLSTATE 23514 |
| CTA partial unique | Pass | SQLSTATE 23505 |

## Residuals after ROLLBACK

| Check | Count |
|---|---:|
| Test products | 0 |
| Test prices | 0 |
| Test capabilities | 0 |

Rollback confirmed: **Yes**.
