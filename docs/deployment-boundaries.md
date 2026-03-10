# Deployment Boundaries

BHT Revenue OS uses two deployment targets: **Netlify** for public UI and **Railway** for CRM backend. Database is **Neon Postgres** (or Railway Postgres if you prefer).

## Netlify — apps/web

| Item | Value |
|------|--------|
| **App** | `apps/web` |
| **Role** | Landing pages, client-facing portal, lightweight frontend. |
| **Build** | Optional (e.g. `npm run build`); publish directory `public` for static site. |
| **Base directory** | If monorepo root is repo root, set Netlify base to `apps/web`. |
| **Env** | No CRM or API secrets. Use public env only (e.g. API base URL for frontend). |
| **Do not** | Run CRM logic, ServiceM8, automation, or backend API here. |

Netlify serves static (or static-built) content. Any dynamic behavior that needs CRM data should call the **CRM API** hosted on Railway.

## Railway — apps/crm

| Item | Value |
|------|--------|
| **App** | `apps/crm` |
| **Role** | REST API, ServiceM8 sync, automation engine, internal operations. |
| **Root directory** | **Repository root** (not `apps/crm`). Required so workspace packages install. |
| **Build** | `pnpm install` — set in dashboard or use repo root `railway.toml`. |
| **Start** | `pnpm --filter @bht/crm start` — set in dashboard or use repo root `railway.toml`. |
| **Cron** | Run `pnpm --filter @bht/crm sync` and `pnpm --filter @bht/crm automations` on a schedule (e.g. daily). |
| **Env** | `DATABASE_URL`, `DATABASE_SSL`, `SERVICEM8_API_KEY`, `TWILIO_*`, `COMPANY_PHONE`. |
| **Database** | Neon Postgres (or Railway Postgres). Run `apps/crm/database/schema.sql` once. |

Railway runs the Node process. Generate a public domain for the API so Netlify (or other clients) can call it.

## Database — Neon Postgres

- Schema lives in `apps/crm/database/schema.sql`. Apply once per environment.
- Connection string and SSL are set via `DATABASE_URL` and `DATABASE_SSL` in the **crm** app only. `apps/web` does not connect to the database.

## Why This Split

- **Netlify** is optimized for static/edge and simple frontends; it is not for long-running Node backends or cron.
- **Railway** is suited for Node API, workers, and cron; keeping CRM there avoids splitting backend logic across platforms.
- **Single repo** keeps one source of truth; separate deploy targets and envs keep security and scaling clear.

For step-by-step Railway setup (including DB and Twilio), see `docs/RAILWAY_DEPLOY.md`.
