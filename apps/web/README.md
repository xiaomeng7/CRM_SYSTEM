# @bht/web

Public-facing UI for **BHT Revenue OS**: landing pages, client portal, lightweight frontend. **Deploy target: Netlify.**

## Boundary

- This app must **not** import from `apps/crm` or from `@bht/integrations`.
- No CRM business logic, ServiceM8, or automation. Call the CRM API (hosted on Railway) via HTTP only when you need data.

## Deployment: Netlify

- **Base directory:** `apps/web` (if building from monorepo root).
- **Build command:** leave empty or `npm run build`
- **Publish directory:** `public`
- **Environment:** No backend secrets. Use public env (e.g. `VITE_CRM_API_URL` or similar) if the frontend calls the API.

## Local

```bash
pnpm dev
# or: npx serve public -l 3001
```
