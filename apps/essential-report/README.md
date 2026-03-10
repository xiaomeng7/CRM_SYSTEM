# Essential Report

Report engine, templates, and report UI. Merged from `essential_report_specs`.

- **Engine / backend:** `netlify/functions/` + scripts (report generation, DB, etc.)
- **Templates:** Root-level `report-template*.html`, `*.docx`, `*.yml`, etc.
- **Report UI:** `src/` (Vite + React)

Deploy: Netlify. Run locally: `pnpm dev` (Vite) or `pnpm netlify:dev`.
