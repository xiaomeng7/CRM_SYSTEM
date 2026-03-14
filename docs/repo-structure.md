# Repository Structure

```
bht-revenue-os/
├── apps/
│   ├── crm/                      # Railway — CRM API, sync, automation, internal UI
│   │   ├── api/
│   │   ├── services/
│   │   ├── automation/
│   │   ├── database/
│   │   └── public/               # Internal CRM UI (Dashboard, Leads, etc.)
│   │
│   ├── web/                      # Netlify — public-facing
│   │   ├── landing-page/          # Advisory / marketing landing (index, admin, Netlify functions)
│   │   └── public/               # Static assets, placeholder index
│   │
│   ├── essential-report/         # Essential Report — engine, templates, report UI
│   │   ├── netlify/              # Functions (report generation)
│   │   ├── src/                  # Report UI (Vite + React)
│   │   ├── scripts/
│   │   ├── migrations/
│   │   └── *.docx, *.html, *.yml # Templates and config
│   │
│   ├── energy-insight-lite/      # Energy Insight Lite — static + Netlify (Stripe, verify)
│   │   ├── index.html
│   │   └── netlify/functions/
│   │
│   └── risk-snapshot/           # Risk Snapshot (ZH) — static + Netlify functions
│       ├── index.html, risk-snapshot*.html
│       └── netlify/functions/
│
├── packages/
│   ├── integrations/             # External service adapters
│   │   ├── servicem8/            # ServiceM8 API client
│   │   ├── sms/                  # Twilio SMS + phone normalization
│   │   ├── index.js
│   │   └── package.json
│   │
│   └── shared/                   # Shared types, utils, constants
│       ├── types/                # DTOs, interfaces (future)
│       ├── schemas/              # Validation (Zod, etc.) (future)
│       ├── constants/            # Domain-agnostic constants (future)
│       ├── index.js
│       └── package.json
│
├── docs/
├── package.json                  # Root workspace scripts
├── pnpm-workspace.yaml
└── .env.example
```

## Apps

| App | Purpose | Deploy |
|-----|---------|--------|
| **crm** | CRM API, internal UI, ServiceM8 sync, automations | Railway |
| **web** | Public site root; `public/` + **landing-page/** | Netlify |
| **essential-report** | Report engine (Netlify functions), templates, report UI (Vite/React) | Netlify |
| **energy-insight-lite** | Energy Lite product page + Stripe + Netlify functions | Netlify |
| **risk-snapshot** | Risk Snapshot (ZH) static site + booking/PDF functions | Netlify |

## Root scripts

| Script | Description |
|--------|-------------|
| `pnpm dev:web` | Serve `apps/web` (public) |
| `pnpm dev:landing` | Serve `apps/web/landing-page` (port 3002) |
| `pnpm dev:crm` | Start CRM API (Railway target) |
| `pnpm dev:report` | Vite dev for Essential Report UI |
| `pnpm dev:energy` | Serve Energy Insight Lite (port 3003) |
| `pnpm dev:risk` | Serve Risk Snapshot (port 3004) |
| `pnpm build:web` / `build:landing` / `build:report` | Build steps where defined |
| `pnpm sync` | ServiceM8 → DB (from apps/crm) |
| `pnpm automations` | Run automation engine |
| `pnpm import:servicem8:legacy` | Legacy one-off ServiceM8 import (NOT recommended; may create noisy contacts) |

## packages/integrations

- **servicem8/** — ServiceM8 REST client (companies, jobs).
- **sms/** — Twilio sendSMS, normalizePhone (E.164).
- Consumed by `apps/crm` via `require('@bht/integrations')`.

## packages/shared

- **types/** — Shared TypeScript/JS types (future).
- **schemas/** — Validation schemas (future).
- **constants/** — Shared constants (future).
