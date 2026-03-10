# BHT Revenue OS

Monorepo for **BHT Revenue OS**: the core operating system for the business — CRM, lead management, opportunity pipeline, communications, automation, ServiceM8 integration, and future AI-assisted workflows.

## Structure

| Path | Purpose | Deploy |
|------|---------|--------|
| `apps/web` | Public UI; `landing-page/` + `public/` | **Netlify** |
| `apps/crm` | CRM API, sync, automation, internal UI | **Railway** |
| `apps/essential-report` | Report engine, templates, report UI | **Netlify** |
| `apps/energy-insight-lite` | Energy Lite page + Stripe/functions | **Netlify** |
| `apps/risk-snapshot` | Risk Snapshot (ZH) static + functions | **Netlify** |
| `packages/shared` | Types, schemas, constants | — |
| `packages/integrations` | ServiceM8, SMS adapters | — |

Database: **Neon Postgres** (or Railway Postgres). Schema: `apps/crm/database/schema.sql`.

## Quick Start

```bash
pnpm install
cp .env.example .env  # then edit .env (use repo root; CRM loads it via apps/crm/lib/load-env.js)
pnpm dev:crm          # CRM API at http://localhost:3000
pnpm dev:web          # Web app at http://localhost:3001
pnpm dev:landing      # Landing page at http://localhost:3002
pnpm dev:report       # Essential Report UI (Vite)
pnpm dev:energy       # Energy Insight Lite at http://localhost:3003
pnpm dev:risk         # Risk Snapshot at http://localhost:3004
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
| `pnpm dev:web` | Run web app |
| `pnpm dev:landing` | Run landing page |
| `pnpm dev:crm` | Run CRM API (Railway) |
| `pnpm dev:report` | Essential Report (Vite) |
| `pnpm dev:energy` | Energy Insight Lite |
| `pnpm dev:risk` | Risk Snapshot |
| `pnpm build:web` / `build:landing` / `build:report` | Build where defined |
| `pnpm sync` | ServiceM8 → DB |
| `pnpm automations` | Run automation engine |
