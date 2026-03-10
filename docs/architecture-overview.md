# BHT Revenue OS — Architecture Overview

BHT Revenue OS is the core operating system for the business: CRM, lead management, opportunity pipeline, communications, automation, ServiceM8 integration, and future AI-assisted workflows. The repository is a **monorepo** with clear deployment and domain boundaries.

## Principles

1. **CRM and business logic are the source of truth** — not ServiceM8. ServiceM8 is synced into our database; we do not drive core decisions from it.
2. **Public vs internal separation** — Netlify serves public-facing UI; Railway runs CRM, API, workers, and automation.
3. **Shared code lives in packages** — integrations and shared utilities are in `packages/*` to avoid duplication and keep boundaries clear.
4. **One repo, multiple deployable apps** — `apps/web` and `apps/crm` deploy independently.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BHT Revenue OS                             │
├─────────────────────────────────────────────────────────────────┤
│  apps/web (Netlify)          │  apps/crm (Railway)                │
│  - Landing pages             │  - REST API (customers, jobs)      │
│  - Client portal             │  - ServiceM8 sync (cron)           │
│  - Public UI only            │  - Automation engine (cron)         │
│  - No CRM logic              │  - Internal operations             │
└──────────────┬───────────────┴──────────────┬────────────────────┘
               │                              │
               │  (optional API calls)        │  DB + integrations
               ▼                              ▼
       ┌───────────────┐              ┌───────────────┐
       │  Netlify CDN  │              │ Neon Postgres │
       └───────────────┘              │ + Twilio etc  │
                                      └───────────────┘
```

## What Lives Where

| Concern | Location | Rationale |
|--------|----------|-----------|
| Public landing / portal UI | `apps/web` | Static or light frontend; Netlify-optimized. |
| CRM API, sync, automation | `apps/crm` | Backend and workers; Railway-optimized. |
| ServiceM8 / SMS adapters | `packages/integrations` | Reusable adapters; no business logic. |
| Shared types, utils, constants | `packages/shared` | Cross-app consistency; future schemas. |
| Database schema | `apps/crm/database` | CRM owns the schema; DB is Neon or Railway Postgres. |

## What Not to Do

- **Do not** put CRM core logic, API routes, or automation in `apps/web`.
- **Do not** make ServiceM8 the source of truth for CRM decisions; sync into our DB and operate from there.
- **Do not** hardcode new workflows in random files; extend automation/triggers and keep domains clear.
- **Do not** mix deployment targets: web → Netlify, crm → Railway.

## Future Extension

The structure is set up for:

- **Lead management and pipeline** — new domains under `apps/crm` or new packages as needed.
- **Workers / queues** — additional entrypoints in `apps/crm` (e.g. `scripts/` or a `workers/` directory).
- **AI-assisted follow-up** — automation and workflows stay in `apps/crm`; call external services via `packages/integrations`.
- **Inspection / report orchestration** — new modules in crm or a dedicated package, without mixing into web.

See `docs/repo-structure.md` and `docs/deployment-boundaries.md` for details.
