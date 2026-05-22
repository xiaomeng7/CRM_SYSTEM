# Cashflow Intelligence API

Phase 1A PR4 — operational read/trigger endpoints (no UI).

## Endpoints

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/cashflow-intel/latest` | None (same as owner-dashboard) |
| GET | `/api/cashflow-intel/history?limit=7` | None |
| POST | `/api/cashflow-intel/run` | `X-Admin-Secret` or `X-Sync-Secret` when env set |

## Cron

```bash
pnpm --filter @bht/crm run job:cashflow-intel
```

## Manual trigger

```bash
curl -X POST http://localhost:3000/api/cashflow-intel/run \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -d '{"force": false, "dry_run": false}'
```
