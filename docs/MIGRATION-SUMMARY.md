# Second-Pass Migration Summary

This document summarizes the second-pass cleanup of the BHT Revenue OS monorepo. No new product features were added; only structure, boundaries, and deployability were improved.

---

## Issues Found and Fixed

### 1. **Broken / inconsistent env loading**

- **Issue:** CRM entrypoints used `require('dotenv').config()` with no path. When running via `pnpm --filter @bht/crm start`, the process cwd is `apps/crm`, so a root-level `.env` was never loaded.
- **Fix:** Added `apps/crm/lib/load-env.js` that loads `../../.env` (monorepo root) first, then falls back to `.env` in cwd. All four entrypoints (api/index.js, api/sync-servicem8.js, automation-engine.js, scripts/run-automations.js) now `require('../lib/load-env')` (or equivalent) before other requires.

### 2. **Leftover empty directories**

- **Issue:** Root-level `api/`, `automation/`, `integrations/`, `lib/`, `scripts/`, `database/` remained after the first pass (files had been deleted, dirs left empty).
- **Fix:** Removed these six empty directories so the repo has a single clear layout.

### 3. **Missing package READMEs**

- **Issue:** `packages/integrations` and `packages/shared` had no README; boundaries and usage were undocumented.
- **Fix:** Added `packages/integrations/README.md` and `packages/shared/README.md` describing purpose, contents, and boundaries.

### 4. **Weak boundary documentation for apps/web**

- **Issue:** apps/web README did not explicitly forbid importing from crm or integrations.
- **Fix:** Updated `apps/web/README.md` with a **Boundary** section: must not import from `apps/crm` or `@bht/integrations`; call CRM via HTTP only.

### 5. **Lockfile and .gitignore**

- **Issue:** Root still had `package-lock.json` (npm); monorepo uses pnpm. Risk of mixed lockfiles on push.
- **Fix:** Added `package-lock.json` to `.gitignore` with a comment that the repo uses pnpm. Kept `pnpm-lock.yaml` tracked for reproducible installs.

### 6. **Docs index**

- **Issue:** No single entry point for the `docs/` folder.
- **Fix:** Added `docs/README.md` with a short table linking to architecture-overview, repo-structure, deployment-boundaries, and RAILWAY_DEPLOY.

### 7. **Repo structure doc accuracy**

- **Issue:** `docs/repo-structure.md` did not list `load-env.js` or the new package READMEs.
- **Fix:** Updated the tree and package descriptions to include `lib/load-env.js` and the READMEs under `packages/shared` and `packages/integrations`.

---

## What Was Not Changed

- **Imports:** All `require('@bht/integrations')` and relative paths within `apps/crm` were already correct; no changes.
- **No duplicate utilities:** `normalizePhone` and other helpers live only in `packages/integrations`; no duplication in crm.
- **Naming:** File and package names are consistent (kebab-case files, `@bht/*` scope); left as-is.
- **Business logic:** No changes to triggers, API handlers, or sync logic.

---

## Verification

- `pnpm install` at root succeeds.
- `pnpm --filter @bht/crm start` starts the API (env loaded from root when `.env` is at root).
- No imports from `apps/web` to `apps/crm` or to `@bht/integrations`.
- Empty root-level dirs removed; only `apps/`, `packages/`, `docs/`, and root config remain at top level.

---

## Ready for GitHub Push

- `.gitignore` excludes `.env`, `node_modules/`, `package-lock.json`, and common build/runtime artifacts.
- Commit `pnpm-lock.yaml` for reproducible installs.
- Do **not** commit `.env`; use `.env.example` as the template and set real secrets in Netlify/Railway.

---

## Next Recommended Steps

1. **Remove `package-lock.json` from the repo** (if it was ever committed): `git rm --cached package-lock.json` and commit. Ensures everyone uses pnpm.
2. **Install pnpm locally** (optional): `npm install -g pnpm` so you can run `pnpm` without `npx`.
3. **Netlify:** In the Netlify dashboard, set **Base directory** to `apps/web`, **Publish directory** to `public`, and (if needed) **Build command** to `cd ../.. && pnpm install && pnpm run build:web` or leave build empty for static.
4. **Railway:** Set **Root directory** to repo root, **Build** to `pnpm install`, **Start** to `pnpm --filter @bht/crm start`. Add all env vars from `.env.example` in Railway Variables.
5. **Cron (Railway or external):** Schedule `pnpm --filter @bht/crm sync` and `pnpm --filter @bht/crm automations` (e.g. daily).
6. **When adding features:** Prefer placing new domains under `apps/crm` (or a new package) and new adapters in `packages/integrations`; keep `apps/web` free of CRM and integration imports.
7. **Optional:** Add ESLint and a root `lint` script that runs across apps and packages; add TypeScript gradually using `tsconfig.base.json` when you introduce `.ts` files.
