/**
 * GA4 Data API → Postgres (page + key events). No UI, no BigQuery.
 * Service account: GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY (Analytics Viewer on property).
 */

const { JWT } = require('google-auth-library');
const { pool } = require('../lib/db');

const GA4_READONLY_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const SYNC_TYPE_GA4 = 'ga4_behavior';
const RUN_TYPE_BEHAVIOR = 'behavior_sync';

const KEY_EVENTS = ['form_start', 'form_submit', 'click_cta'];

function normalizePrivateKey(raw) {
  let k = String(raw || '');
  if (k.includes('\\n')) k = k.replace(/\\n/g, '\n');
  return k;
}

function ga4PropertyResource() {
  let id = String(process.env.GA4_PROPERTY_ID || '').trim();
  id = id.replace(/^properties\//i, '');
  if (!/^\d+$/.test(id)) {
    const e = new Error('missing_ga4_env: GA4_PROPERTY_ID must be numeric (or properties/123...)');
    e.code = 'missing_ga4_env';
    throw e;
  }
  return `properties/${id}`;
}

/**
 * GA4_SYNC_DATE (YYYY-MM-DD) or yesterday (local server timezone).
 */
function getTargetDate() {
  const override = process.env.GA4_SYNC_DATE;
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(override.trim())) {
    return override.trim();
  }
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isDryRunEnv() {
  const v = process.env.GA4_SYNC_DRY_RUN;
  return v === '1' || String(v || '').toLowerCase() === 'true';
}

function assertGa4Env() {
  const missing = [];
  if (!String(process.env.GA4_PROPERTY_ID || '').trim()) missing.push('GA4_PROPERTY_ID');
  if (!String(process.env.GOOGLE_CLIENT_EMAIL || '').trim()) missing.push('GOOGLE_CLIENT_EMAIL');
  if (!String(process.env.GOOGLE_PRIVATE_KEY || '').trim()) missing.push('GOOGLE_PRIVATE_KEY');
  if (missing.length) {
    const e = new Error(`missing_ga4_env: ${missing.join(', ')}`);
    e.code = 'missing_ga4_env';
    throw e;
  }
}

async function getGa4AccessToken() {
  const key = normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY);
  const client = new JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key,
    scopes: [GA4_READONLY_SCOPE],
  });
  const res = await client.getAccessToken();
  if (!res?.token) throw new Error('GA4 auth: no access token from service account');
  return res.token;
}

function gaDateToIso(ga) {
  const s = String(ga || '');
  if (!/^\d{8}$/.test(s)) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function parseIntMetric(v, def = 0) {
  const n = Number.parseInt(String(v ?? '').replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : def;
}

function parseFloatMetric(v) {
  const n = Number.parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function dimIndex(headers) {
  const m = {};
  (headers || []).forEach((h, i) => {
    m[h.name] = i;
  });
  return m;
}

function metIndex(headers) {
  const m = {};
  (headers || []).forEach((h, i) => {
    m[h.name] = i;
  });
  return m;
}

function pickDim(row, di, name) {
  const i = di[name];
  if (i == null || !row.dimensionValues?.[i]) return null;
  return row.dimensionValues[i].value ?? null;
}

function pickMet(row, mi, name) {
  const i = mi[name];
  if (i == null || !row.metricValues?.[i]) return null;
  return row.metricValues[i].value ?? null;
}

async function ga4RunReport(accessToken, propertyResource, body) {
  const url = `https://analyticsdata.googleapis.com/v1beta/${propertyResource}:runReport`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`GA4 runReport HTTP ${res.status}: ${text.slice(0, 2000)}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch (_) {
    throw new Error('GA4 runReport returned non-JSON');
  }
  return json;
}

async function fetchAllReportRows(accessToken, propertyResource, baseBody) {
  const limit = 10000;
  let offset = 0;
  const allRows = [];
  let dimensionHeaders;
  let metricHeaders;
  for (;;) {
    const body = { ...baseBody, limit, offset };
    const report = await ga4RunReport(accessToken, propertyResource, body);
    dimensionHeaders = report.dimensionHeaders || dimensionHeaders;
    metricHeaders = report.metricHeaders || metricHeaders;
    const rows = report.rows || [];
    allRows.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
  }
  return { dimensionHeaders, metricHeaders, rows: allRows };
}

/**
 * @param {{ date: string }} opts YYYY-MM-DD
 */
async function fetchGa4PageMetrics({ date }) {
  assertGa4Env();
  const accessToken = await getGa4AccessToken();
  const propertyResource = ga4PropertyResource();
  const dateRanges = [{ startDate: date, endDate: date }];

  const attempts = [
    {
      dimensions: [
        { name: 'date' },
        { name: 'pagePath' },
        { name: 'pageTitle' },
        { name: 'sessionSource' },
        { name: 'sessionMedium' },
        { name: 'sessionCampaignName' },
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'screenPageViews' },
        { name: 'averageSessionDuration' },
        { name: 'engagementRate' },
        { name: 'bounceRate' },
      ],
    },
    {
      dimensions: [
        { name: 'date' },
        { name: 'pagePath' },
        { name: 'pageTitle' },
        { name: 'sessionSource' },
        { name: 'sessionMedium' },
        { name: 'sessionCampaignName' },
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'screenPageViews' },
        { name: 'averageSessionDuration' },
        { name: 'engagementRate' },
      ],
    },
    {
      dimensions: [{ name: 'date' }, { name: 'pagePath' }, { name: 'pageTitle' }],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'screenPageViews' },
        { name: 'averageSessionDuration' },
        { name: 'engagementRate' },
        { name: 'bounceRate' },
      ],
    },
    {
      dimensions: [{ name: 'date' }, { name: 'pagePath' }, { name: 'pageTitle' }],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'screenPageViews' },
        { name: 'averageSessionDuration' },
        { name: 'engagementRate' },
      ],
    },
    {
      dimensions: [{ name: 'date' }, { name: 'pagePath' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'screenPageViews' }],
    },
  ];

  let lastErr;
  for (const spec of attempts) {
    try {
      const { dimensionHeaders, metricHeaders, rows } = await fetchAllReportRows(
        accessToken,
        propertyResource,
        { dateRanges, dimensions: spec.dimensions, metrics: spec.metrics }
      );
      const di = dimIndex(dimensionHeaders);
      const mi = metIndex(metricHeaders);
      const out = [];
      for (const row of rows) {
        const gaDate = pickDim(row, di, 'date');
        const iso = gaDateToIso(gaDate);
        if (!iso) continue;
        const pagePath = pickDim(row, di, 'pagePath');
        if (pagePath == null || pagePath === '') continue;
        out.push({
          date: iso,
          page_path: pagePath,
          page_title: pickDim(row, di, 'pageTitle') || null,
          sessions: parseIntMetric(pickMet(row, mi, 'sessions')),
          total_users: parseIntMetric(pickMet(row, mi, 'totalUsers')),
          views: parseIntMetric(pickMet(row, mi, 'screenPageViews')),
          engagement_rate: parseFloatMetric(pickMet(row, mi, 'engagementRate')),
          average_session_duration: parseFloatMetric(pickMet(row, mi, 'averageSessionDuration')),
          bounce_rate: parseFloatMetric(pickMet(row, mi, 'bounceRate')),
          source: pickDim(row, di, 'sessionSource') || '',
          medium: pickDim(row, di, 'sessionMedium') || '',
          campaign: pickDim(row, di, 'sessionCampaignName') || '',
        });
      }
      return out;
    } catch (e) {
      lastErr = e;
      const msg = String(e.message || e);
      if (e.status === 400 && /INVALID_ARGUMENT|incompatible|not compatible/i.test(msg)) {
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error('GA4 page metrics: all report shapes failed');
}

/**
 * @param {{ date: string }} opts
 */
async function fetchGa4EventMetrics({ date }) {
  assertGa4Env();
  const accessToken = await getGa4AccessToken();
  const propertyResource = ga4PropertyResource();
  const dateRanges = [{ startDate: date, endDate: date }];
  const dimensionFilter = {
    filter: {
      fieldName: 'eventName',
      inListFilter: { values: KEY_EVENTS, caseSensitive: true },
    },
  };

  const attempts = [
    {
      dimensions: [
        { name: 'date' },
        { name: 'eventName' },
        { name: 'pagePath' },
        { name: 'sessionSource' },
        { name: 'sessionMedium' },
        { name: 'sessionCampaignName' },
      ],
      metrics: [{ name: 'eventCount' }],
    },
    {
      dimensions: [{ name: 'date' }, { name: 'eventName' }, { name: 'pagePath' }],
      metrics: [{ name: 'eventCount' }],
    },
    {
      dimensions: [{ name: 'date' }, { name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
    },
  ];

  let lastErr;
  for (const spec of attempts) {
    try {
      const { dimensionHeaders, metricHeaders, rows } = await fetchAllReportRows(
        accessToken,
        propertyResource,
        {
          dateRanges,
          dimensions: spec.dimensions,
          metrics: spec.metrics,
          dimensionFilter,
        }
      );
      const di = dimIndex(dimensionHeaders);
      const mi = metIndex(metricHeaders);
      const out = [];
      for (const row of rows) {
        const gaDate = pickDim(row, di, 'date');
        const iso = gaDateToIso(gaDate);
        if (!iso) continue;
        const eventName = pickDim(row, di, 'eventName');
        if (!eventName || !KEY_EVENTS.includes(eventName)) continue;
        out.push({
          date: iso,
          page_path: pickDim(row, di, 'pagePath') || '',
          event_name: eventName,
          event_count: parseIntMetric(pickMet(row, mi, 'eventCount')),
          source: pickDim(row, di, 'sessionSource') || '',
          medium: pickDim(row, di, 'sessionMedium') || '',
          campaign: pickDim(row, di, 'sessionCampaignName') || '',
        });
      }
      return out;
    } catch (e) {
      lastErr = e;
      const msg = String(e.message || e);
      if (e.status === 400 && /INVALID_ARGUMENT|incompatible|not compatible/i.test(msg)) {
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error('GA4 event metrics: all report shapes failed');
}

function normKeyPart(v) {
  const s = v == null ? '' : String(v);
  return s.length > 0 ? s : '';
}

function pageRowKey(r) {
  return [r.date, r.page_path, normKeyPart(r.source), normKeyPart(r.medium), normKeyPart(r.campaign)].join('\x1f');
}

/** Merge rows so one INSERT batch has no duplicate ON CONFLICT keys. */
function mergePageRows(rows) {
  const map = new Map();
  for (const r of rows) {
    const k = pageRowKey(r);
    const cur = map.get(k);
    if (!cur) {
      map.set(k, { ...r, source: normKeyPart(r.source), medium: normKeyPart(r.medium), campaign: normKeyPart(r.campaign) });
    } else {
      cur.sessions += r.sessions;
      cur.total_users += r.total_users;
      cur.views += r.views;
      if (r.page_title && !cur.page_title) cur.page_title = r.page_title;
      if (r.engagement_rate != null && cur.engagement_rate == null) cur.engagement_rate = r.engagement_rate;
      if (r.average_session_duration != null && cur.average_session_duration == null) {
        cur.average_session_duration = r.average_session_duration;
      }
      if (r.bounce_rate != null && cur.bounce_rate == null) cur.bounce_rate = r.bounce_rate;
    }
  }
  return [...map.values()];
}

function eventRowKey(r) {
  return [
    r.date,
    normKeyPart(r.page_path),
    r.event_name,
    normKeyPart(r.source),
    normKeyPart(r.medium),
    normKeyPart(r.campaign),
  ].join('\x1f');
}

function mergeEventRows(rows) {
  const map = new Map();
  for (const r of rows) {
    const k = eventRowKey(r);
    const cur = map.get(k);
    if (!cur) {
      map.set(k, {
        ...r,
        page_path: normKeyPart(r.page_path),
        source: normKeyPart(r.source),
        medium: normKeyPart(r.medium),
        campaign: normKeyPart(r.campaign),
      });
    } else {
      cur.event_count += r.event_count;
    }
  }
  return [...map.values()];
}

/**
 * @returns {Promise<{ created_count: number, updated_count: number }>}
 */
async function upsertGa4PageMetrics(rows, db) {
  if (!rows?.length) return { created_count: 0, updated_count: 0 };
  rows = mergePageRows(rows);
  const BATCH = 150;
  let created_count = 0;
  let updated_count = 0;
  const createdBy = 'ga4-sync';

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const placeholders = [];
    const params = [];
    let p = 1;
    for (const r of chunk) {
      placeholders.push(
        `($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`
      );
      params.push(
        r.date,
        r.page_path,
        r.page_title,
        r.sessions,
        r.total_users,
        r.views,
        r.engagement_rate,
        r.average_session_duration,
        r.bounce_rate,
        normKeyPart(r.source),
        normKeyPart(r.medium),
        normKeyPart(r.campaign),
        createdBy
      );
    }
    const sql = `
      INSERT INTO ga4_page_metrics_daily (
        date, page_path, page_title, sessions, total_users, views,
        engagement_rate, average_session_duration, bounce_rate,
        source, medium, campaign, created_by
      ) VALUES ${placeholders.join(',')}
      ON CONFLICT (date, page_path, source, medium, campaign) DO UPDATE SET
        page_title = EXCLUDED.page_title,
        sessions = EXCLUDED.sessions,
        total_users = EXCLUDED.total_users,
        views = EXCLUDED.views,
        engagement_rate = EXCLUDED.engagement_rate,
        average_session_duration = EXCLUDED.average_session_duration,
        bounce_rate = EXCLUDED.bounce_rate,
        updated_at = NOW(),
        created_by = EXCLUDED.created_by
      RETURNING (xmax = 0)::int AS is_insert
    `;
    try {
      const res = await db.query(sql, params);
      for (const row of res.rows) {
        if (Number(row.is_insert) === 1) created_count += 1;
        else updated_count += 1;
      }
    } catch (e) {
      if (!/unique|duplicate key|on conflict/i.test(String(e.message))) throw e;
      for (const r of chunk) {
        const one = await upsertGa4PageMetricsFallbackSingle(r, db);
        created_count += one.created;
        updated_count += one.updated;
      }
    }
  }
  return { created_count, updated_count };
}

async function upsertGa4PageMetricsFallbackSingle(r, db) {
  const src = normKeyPart(r.source);
  const med = normKeyPart(r.medium);
  const camp = normKeyPart(r.campaign);
  const up = await db.query(
    `UPDATE ga4_page_metrics_daily SET
       page_title = $4,
       sessions = $5,
       total_users = $6,
       views = $7,
       engagement_rate = $8,
       average_session_duration = $9,
       bounce_rate = $10,
       updated_at = NOW(),
       created_by = $11
     WHERE date = $1::date AND page_path = $2 AND source = $3 AND medium = $12 AND campaign = $13`,
    [
      r.date,
      r.page_path,
      src,
      r.page_title,
      r.sessions,
      r.total_users,
      r.views,
      r.engagement_rate,
      r.average_session_duration,
      r.bounce_rate,
      'ga4-sync',
      med,
      camp,
    ]
  );
  if (up.rowCount > 0) return { created: 0, updated: 1 };
  await db.query(
    `INSERT INTO ga4_page_metrics_daily (
       date, page_path, page_title, sessions, total_users, views,
       engagement_rate, average_session_duration, bounce_rate,
       source, medium, campaign, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      r.date,
      r.page_path,
      r.page_title,
      r.sessions,
      r.total_users,
      r.views,
      r.engagement_rate,
      r.average_session_duration,
      r.bounce_rate,
      src,
      med,
      camp,
      'ga4-sync',
    ]
  );
  return { created: 1, updated: 0 };
}

/**
 * @returns {Promise<{ created_count: number, updated_count: number }>}
 */
async function upsertGa4EventMetrics(rows, db) {
  if (!rows?.length) return { created_count: 0, updated_count: 0 };
  rows = mergeEventRows(rows);
  const BATCH = 200;
  let created_count = 0;
  let updated_count = 0;
  const createdBy = 'ga4-sync';

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const placeholders = [];
    const params = [];
    let p = 1;
    for (const r of chunk) {
      placeholders.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
      params.push(
        r.date,
        normKeyPart(r.page_path),
        r.event_name,
        r.event_count,
        normKeyPart(r.source),
        normKeyPart(r.medium),
        normKeyPart(r.campaign),
        createdBy
      );
    }
    const sql = `
      INSERT INTO ga4_event_metrics_daily (
        date, page_path, event_name, event_count, source, medium, campaign, created_by
      ) VALUES ${placeholders.join(',')}
      ON CONFLICT (date, page_path, event_name, source, medium, campaign) DO UPDATE SET
        event_count = EXCLUDED.event_count,
        updated_at = NOW(),
        created_by = EXCLUDED.created_by
      RETURNING (xmax = 0)::int AS is_insert
    `;
    try {
      const res = await db.query(sql, params);
      for (const row of res.rows) {
        if (Number(row.is_insert) === 1) created_count += 1;
        else updated_count += 1;
      }
    } catch (e) {
      if (!/unique|duplicate key|on conflict/i.test(String(e.message))) throw e;
      for (const r of chunk) {
        const one = await upsertGa4EventMetricsFallbackSingle(r, db);
        created_count += one.created;
        updated_count += one.updated;
      }
    }
  }
  return { created_count, updated_count };
}

async function upsertGa4EventMetricsFallbackSingle(r, db) {
  const pp = normKeyPart(r.page_path);
  const src = normKeyPart(r.source);
  const med = normKeyPart(r.medium);
  const camp = normKeyPart(r.campaign);
  const up = await db.query(
    `UPDATE ga4_event_metrics_daily SET
       event_count = $4,
       updated_at = NOW(),
       created_by = $5
     WHERE date = $1::date AND page_path = $2 AND event_name = $3 AND source = $6 AND medium = $7 AND campaign = $8`,
    [r.date, pp, r.event_name, r.event_count, 'ga4-sync', src, med, camp]
  );
  if (up.rowCount > 0) return { created: 0, updated: 1 };
  await db.query(
    `INSERT INTO ga4_event_metrics_daily (
       date, page_path, event_name, event_count, source, medium, campaign, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [r.date, pp, r.event_name, r.event_count, src, med, camp, 'ga4-sync']
  );
  return { created: 1, updated: 0 };
}

async function insertGa4SyncRun(db, { dryRun, targetDate }) {
  const r = await db.query(
    `INSERT INTO sync_runs (
       sync_type, mode, dry_run, status,
       source, run_type, target_date, created_by,
       fetched_count, mapped_count, created_count, updated_count, skipped_count
     ) VALUES (
       $1, $2, $3, 'running',
       $4, $5, $6::date, $7,
       0, 0, 0, 0, 0
     ) RETURNING id`,
    [
      SYNC_TYPE_GA4,
      'full',
      dryRun,
      'ga4',
      RUN_TYPE_BEHAVIOR,
      targetDate,
      'ga4-sync',
    ]
  );
  return r.rows[0]?.id || null;
}

async function finishGa4SyncRun(
  db,
  runId,
  {
    status,
    fetched_count,
    mapped_count,
    skipped_count,
    created_count,
    updated_count,
    summary,
    error_message,
  }
) {
  if (!runId) return;
  await db.query(
    `UPDATE sync_runs SET
       finished_at = NOW(),
       status = $2,
       fetched_count = $3,
       mapped_count = $4,
       skipped_count = $5,
       created_count = $6,
       updated_count = $7,
       summary = $8::jsonb,
       error_message = $9
     WHERE id = $1`,
    [
      runId,
      status,
      fetched_count,
      mapped_count,
      skipped_count,
      created_count,
      updated_count,
      summary != null ? JSON.stringify(summary) : null,
      error_message || null,
    ]
  );
}

async function safeFinishGa4SyncRun(db, runId, payload) {
  if (!runId) return;
  try {
    await finishGa4SyncRun(db, runId, payload);
  } catch (e) {
    console.warn('[ga4-sync] WARN sync_runs finish failed:', e.message || e);
  }
}

/**
 * @param {{ db?: import('pg').Pool, dryRun?: boolean, date?: string }} [opts]
 */
async function syncGa4Behavior(opts = {}) {
  const db = opts.db || pool;
  const dryRun =
    opts.dryRun === true ||
    (opts.dryRun !== false && isDryRunEnv());
  const date = opts.date || getTargetDate();

  let runId = null;
  try {
    runId = await insertGa4SyncRun(db, { dryRun, targetDate: date });
  } catch (e) {
    if (/column .* does not exist|relation "sync_runs" does not exist/i.test(e.message || '')) {
      console.warn('[ga4-sync] WARN sync_runs missing or incomplete; run migrations 004/039. Continuing.');
    } else {
      throw e;
    }
  }

  const baseSummary = () => ({
    date,
    dry_run: dryRun,
    page_rows: 0,
    event_rows: 0,
    page_created: 0,
    page_updated: 0,
    event_created: 0,
    event_updated: 0,
    sync_run_id: runId,
  });

  const fail = async (err) => {
    const msg = err.message || String(err);
    await safeFinishGa4SyncRun(db, runId, {
      status: 'failed',
      fetched_count: 0,
      mapped_count: 0,
      skipped_count: 0,
      created_count: 0,
      updated_count: 0,
      summary: baseSummary(),
      error_message: msg.slice(0, 10000),
    });
  };

  try {
    assertGa4Env();
    const pageRows = await fetchGa4PageMetrics({ date });
    const eventRows = await fetchGa4EventMetrics({ date });

    let page_created = 0;
    let page_updated = 0;
    let event_created = 0;
    let event_updated = 0;

    if (!dryRun) {
      const pr = await upsertGa4PageMetrics(pageRows, db);
      page_created = pr.created_count;
      page_updated = pr.updated_count;
      const er = await upsertGa4EventMetrics(eventRows, db);
      event_created = er.created_count;
      event_updated = er.updated_count;
    }

    const fetched_count = pageRows.length + eventRows.length;
    const summary = {
      ...baseSummary(),
      page_rows: pageRows.length,
      event_rows: eventRows.length,
      page_created,
      page_updated,
      event_created,
      event_updated,
    };

    await safeFinishGa4SyncRun(db, runId, {
      status: 'success',
      fetched_count,
      mapped_count: pageRows.length,
      skipped_count: 0,
      created_count: page_created + event_created,
      updated_count: page_updated + event_updated,
      summary,
      error_message: null,
    });

    return summary;
  } catch (err) {
    await fail(err);
    throw err;
  }
}

module.exports = {
  getTargetDate,
  assertGa4Env,
  fetchGa4PageMetrics,
  fetchGa4EventMetrics,
  upsertGa4PageMetrics,
  upsertGa4EventMetrics,
  syncGa4Behavior,
  isDryRunEnv,
  SYNC_TYPE_GA4,
  RUN_TYPE_BEHAVIOR,
};
