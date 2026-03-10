# BHT Revenue OS

Monorepo for **BHT Revenue OS**: the core operating system for the business — CRM, lead management, opportunity pipeline, communications, automation, ServiceM8 integration, and future AI-assisted workflows.

## Structure

| Path | Purpose | Deploy |
|------|---------|--------|
| `apps/web` | Public UI, landing pages, client portal | **Netlify** |
| `apps/crm` | CRM API, sync, automation, internal backend | **Railway** |
| `packages/shared` | Shared types, utils, constants | — |
| `packages/integrations` | ServiceM8, SMS, other external adapters | — |

Database: **Neon Postgres** (or Railway Postgres). Schema: `apps/crm/database/schema.sql`.

## Quick Start

```bash
pnpm install
cp .env.example .env  # then edit .env (use repo root; CRM loads it via apps/crm/lib/load-env.js)
pnpm dev:crm          # CRM API at http://localhost:3000
pnpm dev:web          # Web app at http://localhost:3001 (if serve installed)
pnpm sync             # ServiceM8 → DB (from apps/crm)
pnpm automations      # Run automation engine (from apps/crm)
```

Use **pnpm** (not npm) for installs. Put `.env` at **repo root**; the CRM app loads it automatically when run from the monorepo.

## Docs

- [Architecture overview](docs/architecture-overview.md)
- [Repo structure](docs/repo-structure.md)
- [Deployment boundaries](docs/deployment-boundaries.md)
- [Railway deployment](docs/RAILWAY_DEPLOY.md)
- [Migration summary & next steps](docs/MIGRATION-SUMMARY.md)

## Scripts (root)

| Script | Description |
|--------|-------------|
| `pnpm dev:web` | Run web app (Netlify target) |
| `pnpm dev:crm` | Run CRM API (Railway target) |
| `pnpm build:web` | Build web app |
| `pnpm sync` | Run ServiceM8 sync |
| `pnpm automations` | Run automation engine |
