# @bht/crm

CRM core for **BHT Revenue OS**: REST API, ServiceM8 sync, automation engine. Internal operations backend.

## Deployment: Railway

- **Start command:** `npm start` (runs `node api/index.js`)
- **Cron / workers:** Run `npm run sync` and `npm run automations` on a schedule (Railway Cron or external).
- **Environment:** `DATABASE_URL`, `DATABASE_SSL`, `SERVICEM8_API_KEY`, `TWILIO_*`, `COMPANY_PHONE` (see root `.env.example`).
- Database: Neon Postgres or Railway Postgres. Run `database/schema.sql` once to bootstrap.

## Local

```bash
pnpm install
pnpm start          # API on PORT
pnpm run sync       # ServiceM8 → DB
pnpm run automations # Run automation triggers
```

## Boundaries

- CRM business logic and API live here. ServiceM8 is a **sync source**, not the source of truth.
- Integrations (ServiceM8, SMS) are in `packages/integrations`; this app consumes them.
