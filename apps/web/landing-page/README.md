# BHT Energy Decision Advisory – Adelaide Pilot (Pro)

**Product name: Pro.** Standalone landing page for Better Home Technology's Energy Decision Advisory. Visitors apply first (no payment). Applications stored in Neon Postgres and emailed to sales.

## Setup

### 1. Database

```bash
psql "$NEON_DATABASE_URL" -f migrations/002_advisory_applications.sql
psql "$NEON_DATABASE_URL" -f migrations/003_advisory_source_lite.sql
```
The second migration adds `source` and `lite_snapshot` for Lite → Pro attribution.

### 2. Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEON_DATABASE_URL` | Yes | Neon Postgres connection string |
| `BHT_ADVISORY_EMAIL_TO` | Yes | Sales email for notifications |
| `POSTMARK_API_KEY` or `MAILGUN_API_KEY` + `MAILGUN_DOMAIN` | Yes | Email provider |

Optional: `BHT_ADVISORY_FROM_EMAIL`, `BHT_ADVISORY_FROM_NAME`, `RATE_LIMIT_SALT`

Admin page: add `ADMIN_SECRET_KEY` in Netlify env vars, then open `/admin.html` and enter the key to view applications.

### 3. Deploy to Netlify

1. Create a new repo from this folder and connect to Netlify
2. Publish directory: `.`
3. Build command: empty
4. Functions directory: `netlify/functions`
5. Add env vars in Site settings

### 4. Local dev

```bash
npm install
netlify dev
```

Open `http://localhost:8888/`.

### Troubleshooting

- **`/api/apply-advisory` returns 500** – Usually the DB is missing the Lite→Pro columns. Run:  
  `psql "$NEON_DATABASE_URL" -f migrations/003_advisory_source_lite.sql`
- **WebSocket `ws://localhost:8081/` failed** – From Netlify Dev or a browser extension (e.g. Live Reload). Safe to ignore.
