# Environment Variables — Inventory

Complete inventory of environment variables used in the BHT Revenue OS monorepo. Use this for local `.env` and for configuring Railway (apps/crm) and Netlify (apps/web).

---

## Summary by app/package

| Variable | apps/crm | packages/integrations | apps/web | Required | Secret |
|----------|----------|------------------------|----------|----------|--------|
| PORT | ✓ | — | — | No | No |
| DATABASE_URL | ✓ | — | — | Yes* | Yes |
| DATABASE_SSL | ✓ | — | — | No | No |
| SERVICEM8_API_KEY | ✓ (via integrations) | ✓ | — | Yes** | Yes |
| TWILIO_ACCOUNT_SID | ✓ (via integrations) | ✓ | — | Yes*** | Yes |
| TWILIO_AUTH_TOKEN | ✓ (via integrations) | ✓ | — | Yes*** | Yes |
| TWILIO_SENDER_ID | — | ✓ | — | No | Yes |
| TWILIO_PHONE_NUMBER | — | ✓ | — | No**** | Yes |
| COMPANY_PHONE | ✓ | — | — | No | No |
| DRY_RUN | ✓ (scripts only) | — | — | No | No |

\* Required for API, sync, automations, import.  
\** Required for ServiceM8 sync and import.  
\*** Required for sending SMS (automations).  
\**** One of TWILIO_SENDER_ID or TWILIO_PHONE_NUMBER is required for SMS.

---

## apps/crm

All variables are **backend-only**. Do not expose to the browser.

| Variable | Purpose | Required | Example / format | Where to set |
|----------|---------|----------|------------------|--------------|
| **PORT** | HTTP server port. Default 3000. | No | `3000` | Railway sets automatically; omit in .env unless overriding. |
| **DATABASE_URL** | PostgreSQL connection string. | Yes (for API, sync, automations, import) | `postgresql://user:pass@host:5432/dbname?sslmode=require` | Railway (reference or value), Neon, or .env at repo root. |
| **DATABASE_SSL** | Use SSL for DB connection. | No | `true` or `false` | Railway / .env. Use `true` for Neon and Railway Postgres. |
| **COMPANY_PHONE** | Company phone shown in automation SMS. | No | `0412 345 678` | Railway / .env. Not secret (appears in messages). |
| **DRY_RUN** | When `true` or `1`, certain scripts (legacy import, sync) do not write to DB. | No | `true` or `1` | CLI only, e.g. `DRY_RUN=true pnpm sync:servicem8:all`。不建议再用在 legacy `import-servicem8-customers.js` 上。 |

apps/crm also uses (via `@bht/integrations`): **SERVICEM8_API_KEY**, **TWILIO_ACCOUNT_SID**, **TWILIO_AUTH_TOKEN**, **TWILIO_SENDER_ID**, **TWILIO_PHONE_NUMBER** — see packages/integrations below.

**Where to set:** Railway → Service (CRM) → Variables. For local dev, set in `.env` at **repo root**.

---

## packages/integrations

These are read by code in `packages/integrations` and used when apps/crm runs (sync, automations, import). All are **backend-only / secret** except as noted.

| Variable | Purpose | Required | Example / format | Where to set |
|----------|---------|----------|------------------|--------------|
| **SERVICEM8_API_KEY** | ServiceM8 API authentication. | Yes (for sync and import) | From ServiceM8 → Settings → API Keys | Railway / .env. Never in frontend. |
| **TWILIO_ACCOUNT_SID** | Twilio account identifier. | Yes (for SMS) | From Twilio Console | Railway / .env. Secret. |
| **TWILIO_AUTH_TOKEN** | Twilio API secret. | Yes (for SMS) | From Twilio Console | Railway / .env. Secret. |
| **TWILIO_SENDER_ID** | Alphanumeric sender (e.g. company name). | No | `BHtechnolog` (≤11 chars, AU) | Railway / .env. If set, used instead of TWILIO_PHONE_NUMBER. |
| **TWILIO_PHONE_NUMBER** | Twilio number for sending SMS. | No* | `+61412345678` (E.164) | Railway / .env. *Required if TWILIO_SENDER_ID is not set. |

\* At least one of **TWILIO_SENDER_ID** or **TWILIO_PHONE_NUMBER** must be set for SMS.

**Where to set:** Same as apps/crm (Railway / repo root .env). Integrations are only used server-side by apps/crm.

---

## apps/web

No environment variables are read in code today. The app is static (e.g. `public/index.html`).

| Variable | Purpose | Required | Example / format | Where to set |
|----------|---------|----------|------------------|--------------|
| *(none currently)* | — | — | — | — |

**Future (e.g. when frontend calls CRM API):** Use a **public** variable such as `VITE_CRM_API_URL` or `NEXT_PUBLIC_CRM_API_URL`. Only put **non-secret** values in Netlify env for the web app; never put DATABASE_URL, API keys, or Twilio credentials there.

**Where to set:** Netlify → Site → Environment variables (only when you add frontend env).

---

## Root / shared

There is no separate “root” app. The **repo root `.env`** is used by apps/crm (via `load-env.js`). All variables listed under apps/crm and packages/integrations belong in that single `.env` at root for local development.

---

## Variables in code but not in .env.example

| Variable | In code | In .env.example | Action |
|----------|---------|------------------|--------|
| PORT | api/index.js | No | Omit from .env.example (Railway/local default). Documented above. |
| DRY_RUN | import-servicem8-customers.js | No | Script-only; use CLI. Documented above. |

No other variables are read in code and missing from .env.example.

---

## Variables in .env.example that are used

All variables currently listed in `.env.example` are used in code: DATABASE_URL, DATABASE_SSL, SERVICEM8_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, TWILIO_SENDER_ID, COMPANY_PHONE.

---

## Likely no longer needed

None. Every variable referenced in the repo is used by an active path (API, sync, automations, import, or SMS).

---

## Security: backend secrets and frontend

- **apps/web** does not read `process.env` (or any env) in code. No backend secrets are exposed to the frontend.
- **packages/integrations** (ServiceM8, Twilio) run only in Node (apps/crm). They are never bundled for the browser.
- **Secrets:** Treat as secret and never commit: DATABASE_URL, SERVICEM8_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN. TWILIO_SENDER_ID and TWILIO_PHONE_NUMBER are also sensitive (account-linked).
- **Public / non-secret:** PORT, DATABASE_SSL (boolean), COMPANY_PHONE (appears in SMS), DRY_RUN.

---

## Where to set variables by platform

| Platform | App | Variables to set |
|----------|-----|------------------|
| **Railway** | CRM (Backend) | DATABASE_URL, DATABASE_SSL, SERVICEM8_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER or TWILIO_SENDER_ID, COMPANY_PHONE. PORT is set by Railway. |
| **Netlify** | Web | None currently. Later: only public vars (e.g. VITE_CRM_API_URL) if the frontend calls the API. |
| **Local** | — | Copy `.env.example` to `.env` at repo root and fill in values. Used by apps/crm and scripts. |
