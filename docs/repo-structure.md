# Repository Structure

```
/
├── apps/
│   ├── web/                    # Netlify app
│   │   ├── public/             # Static assets, index.html
│   │   ├── package.json
│   │   ├── netlify.toml
│   │   └── README.md
│   └── crm/                    # Railway app
│       ├── api/                # Express server, routes, sync script
│       │   ├── index.js        # API entry
│       │   ├── customers.js
│       │   ├── jobs.js
│       │   └── sync-servicem8.js
│       ├── automation/         # Triggers and engine
│       │   ├── automation-engine.js
│       │   └── triggers.js
│       ├── scripts/
│       │   └── run-automations.js
│       ├── lib/
│       │   ├── load-env.js     # Load .env from monorepo root or cwd
│       │   └── db.js
│       ├── database/
│       │   └── schema.sql
│       ├── package.json
│       └── README.md
├── packages/
│   ├── shared/                 # Shared types, utils, constants
│   │   ├── index.js
│   │   ├── package.json
│   │   └── README.md
│   └── integrations/           # External service adapters
│       ├── servicem8-client.js
│       ├── sms-client.js
│       ├── index.js
│       ├── package.json
│       └── README.md
├── docs/
│   ├── architecture-overview.md
│   ├── repo-structure.md
│   ├── deployment-boundaries.md
│   └── RAILWAY_DEPLOY.md
├── package.json                # Root workspace scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .env.example
├── .gitignore
└── README.md
```

## apps/web

- **Purpose:** Public-facing UI only (landing, future client portal).
- **Contents:** Static HTML/CSS/JS in `public/`; no backend, no CRM logic.
- **Deploy:** Netlify. Publish `public`; optional build step later (e.g. static generator).

## apps/crm

- **Purpose:** CRM core — API, ServiceM8 sync, automation engine, internal operations.
- **Contents:**
  - `api/` — Express app, customer/job routes, sync script.
  - `automation/` — Trigger definitions and engine (evaluates, sends SMS, logs).
  - `scripts/` — Cron entrypoints (e.g. `run-automations.js`).
  - `lib/` — DB pool (Postgres).
  - `database/` — Schema and migrations (single `schema.sql` for now).
- **Deploy:** Railway. Start command: `npm start`. Cron: `sync`, `automations`.

## packages/shared

- **Purpose:** Domain-agnostic shared code — constants, utils, (future) types/schemas.
- **Contents:** Currently a thin `index.js` placeholder. Add validation schemas, shared constants, or small utilities here. No CRM or ServiceM8 business logic.

## packages/integrations

- **Purpose:** Adapters for external services (ServiceM8, Twilio/SMS, future email etc.).
- **Contents:** API clients and transport only. No CRM business logic; consumed by `apps/crm`.

## packages/ui (optional)

- Not created yet. Add `packages/ui` when you have real shared components between web and a future CRM frontend; keep minimal until then.
