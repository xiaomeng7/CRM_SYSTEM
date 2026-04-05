/**
 * Google Ads cost sync — REST + OAuth2 (google-auth-library).
 *
 * Why REST: minimal deps, GAQL over HTTP, easy to debug.
 * No OpenClaw, no UI. Optional auto-create campaigns via GOOGLE_ADS_AUTO_CREATE_CAMPAIGNS.
 */

const { OAuth2Client } = require('google-auth-library');
const { pool } = require('../lib/db');

let _manualUpsertMode = null;

const SYNC_TYPE_GOOGLE_ADS = 'google_ads';
const RUN_TYPE_COST_SYNC = 'cost_sync';

function apiVersion() {
  return (process.env.GOOGLE_ADS_API_VERSION || 'v17').replace(/^v?/, 'v');
}

function isAutoCreateCampaignsEnabled() {
  const v = process.env.GOOGLE_ADS_AUTO_CREATE_CAMPAIGNS;
  return v === '1' || String(v || '').toLowerCase() === 'true';
}

/**
 * GOOGLE_ADS_SYNC_DATE (YYYY-MM-DD) or yesterday in **local** server timezone (v1).
 */
function getTargetDate() {
  const override = process.env.GOOGLE_ADS_SYNC_DATE;
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

function maskCustomerId(raw) {
  const cid = String(raw || '').replace(/-/g, '');
  if (cid.length < 4) return '****';
  return `******${cid.slice(-4)}`;
}

function assertGoogleAdsEnv() {
  const missing = [];
  if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) missing.push('GOOGLE_ADS_DEVELOPER_TOKEN');
  if (!process.env.GOOGLE_ADS_CLIENT_ID) missing.push('GOOGLE_ADS_CLIENT_ID');
  if (!process.env.GOOGLE_ADS_CLIENT_SECRET) missing.push('GOOGLE_ADS_CLIENT_SECRET');
  if (!process.env.GOOGLE_ADS_REFRESH_TOKEN) missing.push('GOOGLE_ADS_REFRESH_TOKEN');
  const cid = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
  if (!cid || !/^\d{10}$/.test(cid)) missing.push('GOOGLE_ADS_CUSTOMER_ID (10 digits)');
  if (missing.length) {
    throw new Error(`Missing or invalid Google Ads env: ${missing.join(', ')}`);
  }
}

async function getAdsAccessToken() {
  const client = new OAuth2Client(
    process.env.GOOGLE_ADS_CLIENT_ID,
    process.env.GOOGLE_ADS_CLIENT_SECRET
  );
  client.setCredentials({ refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN });
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('Google OAuth2 returned no access token');
  return token;
}

function microsToSpend(microsStr) {
  const n = Number(microsStr);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round((n / 1_000_000) * 100) / 100;
}

async function getTableColumns(db, tableName) {
  const r = await db.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return new Set(r.rows.map((x) => x.column_name));
}

async function insertGoogleAdsSyncRun(db, { dryRun, targetDate }) {
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
      SYNC_TYPE_GOOGLE_ADS,
      'full',
      dryRun,
      SYNC_TYPE_GOOGLE_ADS,
      RUN_TYPE_COST_SYNC,
      targetDate,
      'google-ads-sync',
    ]
  );
  return r.rows[0]?.id || null;
}

async function finishGoogleAdsSyncRun(
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

async function safeFinishGoogleAdsSyncRun(db, runId, payload) {
  if (!runId) return;
  try {
    await finishGoogleAdsSyncRun(db, runId, payload);
  } catch (e) {
    console.warn('[google-ads-sync] WARN sync_runs finish failed:', e.message || e);
  }
}

function parseMetricInt(v) {
  const n = Number.parseInt(String(v ?? '').replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function parseMetricFloat(v) {
  const n = Number.parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

async function runGoogleAdsSearchQuery(query, dateStr) {
  assertGoogleAdsEnv();
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
  const loginCid = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '').replace(/-/g, '');
  const ver = apiVersion();

  const headers = {
    Authorization: `Bearer ${await getAdsAccessToken()}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json',
  };
  if (loginCid && /^\d{10}$/.test(loginCid)) {
    headers['login-customer-id'] = loginCid;
  }

  const raw = [];
  let pageToken = null;
  do {
    const body = { query, pageSize: 10000 };
    if (pageToken) body.pageToken = pageToken;

    const url = `https://googleads.googleapis.com/${ver}/customers/${customerId}/googleAds:search`;
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`Google Ads API HTTP ${res.status}: ${text.slice(0, 800)}`);
      err.status = res.status;
      err.body = text;
      throw err;
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch (_) {
      throw new Error('Google Ads API returned non-JSON');
    }
    const results = json.results || [];
    for (const row of results) {
      const id = row.campaign?.id != null ? String(row.campaign.id) : '';
      const name = row.campaign?.name != null ? String(row.campaign.name).trim() : '';
      const micros =
        row.metrics?.costMicros != null
          ? String(row.metrics.costMicros)
          : row.metrics?.cost_micros != null
            ? String(row.metrics.cost_micros)
            : '0';
      const segDate = row.segments?.date || dateStr;
      const impressions = parseMetricInt(row.metrics?.impressions);
      const clicks = parseMetricInt(row.metrics?.clicks);
      const conv = parseMetricFloat(row.metrics?.conversions);
      const convVal = parseMetricFloat(
        row.metrics?.conversionsValue != null
          ? row.metrics.conversionsValue
          : row.metrics?.conversions_value != null
            ? row.metrics.conversions_value
            : null
      );
      if (name) {
        raw.push({
          google_campaign_id: id,
          google_campaign_name: name,
          date: segDate,
          spend: microsToSpend(micros),
          impressions,
          clicks,
          conversions: conv,
          conversion_value: convVal,
        });
      }
    }
    pageToken = json.nextPageToken || null;
  } while (pageToken);

  const byKey = new Map();
  for (const r of raw) {
    const k = `${r.google_campaign_id}\t${r.google_campaign_name}\t${r.date}`;
    const prev = byKey.get(k);
    if (prev) {
      prev.spend = Math.round((prev.spend + r.spend) * 100) / 100;
      prev.impressions += r.impressions;
      prev.clicks += r.clicks;
      if (r.conversions != null) {
        prev.conversions = (prev.conversions || 0) + r.conversions;
      }
      if (r.conversion_value != null) {
        prev.conversion_value = (prev.conversion_value || 0) + r.conversion_value;
      }
    } else {
      byKey.set(k, { ...r });
    }
  }
  return [...byKey.values()];
}

/**
 * Campaign-level daily row from Google Ads (v1 grain: one row per campaign per day).
 * Tries full metrics first; falls back without metrics.conversions_value if API rejects field.
 * @param {string} dateStr YYYY-MM-DD
 * @returns {Promise<Array<{ google_campaign_id: string, google_campaign_name: string, date: string, spend: number, impressions: number, clicks: number, conversions: number|null, conversion_value: number|null }>>}
 */
async function fetchGoogleAdsCampaignDailyRows(dateStr) {
  const base = `
    SELECT
      campaign.id,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      __CONV_COL__
      segments.date
    FROM campaign
    WHERE segments.date = '${dateStr}'
      AND campaign.status IN ('ENABLED', 'PAUSED')
  `.trim();

  const withConvVal = base.replace('__CONV_COL__', 'metrics.conversions_value,');
  const withoutConvVal = base.replace('__CONV_COL__', '');

  try {
    return await runGoogleAdsSearchQuery(withConvVal, dateStr);
  } catch (e) {
    const msg = String(e.message || e);
    if (/UNRECOGNIZED_FIELD|FieldError|invalid.*metrics/i.test(msg) || /conversions_value/i.test(msg)) {
      console.warn('[google-ads-sync] retrying GAQL without metrics.conversions_value');
      return await runGoogleAdsSearchQuery(withoutConvVal, dateStr);
    }
    throw e;
  }
}

/**
 * @param {string} dateStr YYYY-MM-DD
 * @returns {Promise<Array<{ google_campaign_id: string, google_campaign_name: string, date: string, spend: number }>>}
 */
async function fetchGoogleAdsCampaignCosts(dateStr) {
  const rows = await fetchGoogleAdsCampaignDailyRows(dateStr);
  return rows.map((r) => ({
    google_campaign_id: r.google_campaign_id,
    google_campaign_name: r.google_campaign_name,
    date: r.date,
    spend: r.spend,
  }));
}

function stableCampaignCode(googleCampaignId) {
  const id = String(googleCampaignId || '').replace(/\D/g, '') || 'unknown';
  return `ga_${id}`.slice(0, 100);
}

async function resolveGoogleAdsSourceId(db) {
  try {
    const r = await db.query(`SELECT id FROM lead_sources WHERE code = 'google_ads' LIMIT 1`);
    return r.rows[0]?.id || null;
  } catch (e) {
    if (/relation .* does not exist/i.test(e.message || '')) return null;
    throw e;
  }
}

/**
 * Auto-create a local campaign row (only when GOOGLE_ADS_AUTO_CREATE_CAMPAIGNS is on).
 */
async function createCampaignFromGoogleRow(db, row, cols, sourceId) {
  const gid = String(row.google_campaign_id || '').trim();
  const gname = String(row.google_campaign_name || '').trim();
  if (!gid || !gname) throw new Error('createCampaignFromGoogleRow: missing id or name');

  const code = stableCampaignCode(gid);
  const name = gname.slice(0, 255);

  const fields = [];
  const values = [];
  const push = (col, val, placeholder = null) => {
    if (!cols.has(col)) return;
    fields.push(col);
    values.push(val);
  };

  push('code', code);
  push('name', name);
  push('status', 'active');
  push('source_id', sourceId);
  push('google_campaign_id', gid);
  push('platform', 'google');
  push('external_campaign_id', gid);
  push('objective', 'lead_gen');
  push('metadata', {
    auto_created: true,
    import: 'google-ads-sync',
    google_campaign_name: gname,
  });
  push('created_by', 'google-ads-sync');

  if (!fields.includes('name')) {
    throw new Error('campaigns.name is required but column missing');
  }

  const ph = fields.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `INSERT INTO campaigns (${fields.join(', ')}) VALUES (${ph}) RETURNING id`;

  try {
    const ins = await db.query(sql, values);
    return ins.rows[0].id;
  } catch (e) {
    if (e.code === '23505') {
      const r2 = await db.query(
        `SELECT id FROM campaigns
         WHERE google_campaign_id = $1 OR code = $2
         LIMIT 1`,
        [gid, code]
      );
      if (r2.rows[0]?.id) return r2.rows[0].id;
    }
    throw e;
  }
}

/**
 * @param {Array<{ google_campaign_id, google_campaign_name, date, spend }>} rows
 * @param {import('pg').Pool} [db]
 * @param {object} [options]
 * @param {boolean} [options.autoCreateCampaigns]
 * @returns {Promise<{ mapped: Array<object>, skipped: Array<object>, auto_created_count: number, backfill_google_id_count: number }>}
 */
async function mapRowsToLocalCampaigns(rows, db = pool, options = {}) {
  const autoCreateCampaigns = Boolean(options.autoCreateCampaigns);
  const googleIds = [...new Set(rows.map((r) => String(r.google_campaign_id || '').trim()).filter(Boolean))];
  const names = [...new Set(rows.map((r) => String(r.google_campaign_name || '').trim()).filter(Boolean))];

  if (googleIds.length === 0 && names.length === 0) {
    return { mapped: [], skipped: [], auto_created_count: 0, backfill_google_id_count: 0 };
  }

  const cols = await getTableColumns(db, 'campaigns');
  if (!cols.has('google_campaign_id')) {
    throw new Error(
      'campaigns.google_campaign_id missing; run migration 039_sync_runs_and_google_campaign_mapping.sql'
    );
  }

  const conditions = [];
  const params = [];
  let pi = 1;
  if (googleIds.length) {
    conditions.push(`google_campaign_id = ANY($${pi}::text[])`);
    params.push(googleIds);
    pi += 1;
  }
  if (names.length) {
    conditions.push(`code = ANY($${pi}::text[])`);
    params.push(names);
    pi += 1;
    conditions.push(`name = ANY($${pi}::text[])`);
    params.push(names);
  }

  const cr = await db.query(
    `SELECT id, code, name, google_campaign_id FROM campaigns WHERE ${conditions.join(' OR ')}`,
    params
  );

  const byGoogleId = new Map();
  const byCode = new Map();
  const byName = new Map();
  const idRow = new Map();
  for (const c of cr.rows) {
    idRow.set(c.id, c);
    if (c.google_campaign_id != null && String(c.google_campaign_id).trim()) {
      byGoogleId.set(String(c.google_campaign_id).trim(), c.id);
    }
    if (c.code != null && String(c.code).trim()) {
      byCode.set(String(c.code).trim(), c.id);
    }
    if (c.name != null && String(c.name).trim()) {
      byName.set(String(c.name).trim(), c.id);
    }
  }

  const sourceId = autoCreateCampaigns ? await resolveGoogleAdsSourceId(db) : null;

  const mapped = [];
  const skipped = [];
  const backfillPairs = [];
  let auto_created_count = 0;

  for (const row of rows) {
    const gname = String(row.google_campaign_name || '').trim();
    const gid = String(row.google_campaign_id || '').trim();

    let campaignId = gid ? byGoogleId.get(gid) : null;
    let matchVia = campaignId ? 'google_id' : null;

    if (!campaignId) {
      campaignId = byCode.get(gname) || null;
      if (campaignId) matchVia = 'code';
    }
    if (!campaignId) {
      campaignId = byName.get(gname) || null;
      if (campaignId) matchVia = 'name';
    }

    if (!campaignId && autoCreateCampaigns) {
      try {
        const newId = await createCampaignFromGoogleRow(db, row, cols, sourceId);
        const newRow = {
          id: newId,
          code: stableCampaignCode(gid),
          name: gname.slice(0, 255),
          google_campaign_id: gid,
        };
        idRow.set(newId, newRow);
        byGoogleId.set(gid, newId);
        byCode.set(newRow.code, newId);
        byName.set(gname, newId);
        campaignId = newId;
        matchVia = 'auto_create';
        auto_created_count += 1;
      } catch (e) {
        console.warn(`[google-ads-sync] WARN auto-create failed for "${gname}" id=${gid}:`, e.message || e);
        skipped.push({
          google_campaign_name: row.google_campaign_name,
          google_campaign_id: row.google_campaign_id,
          reason: 'auto_create_failed',
          error: String(e.message || e),
        });
        continue;
      }
    }

    if (!campaignId) {
      skipped.push({
        google_campaign_name: row.google_campaign_name,
        google_campaign_id: row.google_campaign_id,
        reason: 'no_local_campaign',
      });
      console.warn(
        `[google-ads-sync] WARN skip unmapped Google campaign name="${gname}" id=${row.google_campaign_id}`
      );
      continue;
    }

    if (matchVia && matchVia !== 'google_id' && matchVia !== 'auto_create' && gid) {
      const rec = idRow.get(campaignId);
      if (rec && (!rec.google_campaign_id || !String(rec.google_campaign_id).trim())) {
        backfillPairs.push({ campaignId, gid });
      }
    }

    mapped.push({
      campaign_id: campaignId,
      date: row.date,
      spend: row.spend,
      google_campaign_name: row.google_campaign_name,
      google_campaign_id: row.google_campaign_id,
    });
  }

  let backfill_google_id_count = 0;
  const seenBf = new Set();
  for (const { campaignId, gid } of backfillPairs) {
    const k = `${campaignId}:${gid}`;
    if (seenBf.has(k)) continue;
    seenBf.add(k);
    try {
      const up = await db.query(
        `UPDATE campaigns
         SET google_campaign_id = $1, updated_at = NOW()
         WHERE id = $2 AND (google_campaign_id IS NULL OR TRIM(google_campaign_id) = '')`,
        [gid, campaignId]
      );
      if (up.rowCount > 0) {
        backfill_google_id_count += 1;
        const rec = idRow.get(campaignId);
        if (rec) rec.google_campaign_id = gid;
        byGoogleId.set(gid, campaignId);
      }
    } catch (e) {
      if (e.code === '23505') {
        console.warn(
          `[google-ads-sync] WARN backfill google_campaign_id=${gid} skipped (unique conflict) for campaign ${campaignId}`
        );
      } else {
        throw e;
      }
    }
  }

  return { mapped, skipped, auto_created_count, backfill_google_id_count };
}

async function upsertOneConflict(db, row) {
  const r = await db.query(
    `INSERT INTO campaign_costs (campaign_id, date, spend, created_by, updated_at)
     VALUES ($1, $2::date, $3, $4, NOW())
     ON CONFLICT (campaign_id, date)
     DO UPDATE SET spend = EXCLUDED.spend, updated_at = NOW(), created_by = EXCLUDED.created_by
     RETURNING (xmax = 0) AS inserted`,
    [row.campaign_id, row.date, row.spend, 'google-ads-sync']
  );
  return r.rows[0]?.inserted === true ? 'insert' : 'update';
}

async function upsertOneManual(db, row) {
  const up = await db.query(
    `UPDATE campaign_costs
     SET spend = $3, updated_at = NOW(), created_by = $4
     WHERE campaign_id = $1 AND date = $2::date`,
    [row.campaign_id, row.date, row.spend, 'google-ads-sync']
  );
  if (up.rowCount > 0) return 'update';
  await db.query(
    `INSERT INTO campaign_costs (campaign_id, date, spend, created_by, updated_at)
     VALUES ($1, $2::date, $3, $4, NOW())`,
    [row.campaign_id, row.date, row.spend, 'google-ads-sync']
  );
  return 'insert';
}

/**
 * @param {Array<{ campaign_id, date, spend }>} mappedRows
 * @param {import('pg').Pool} [db]
 * @returns {Promise<{ created_count: number, updated_count: number }>}
 */
async function upsertCampaignCosts(mappedRows, db = pool) {
  let created_count = 0;
  let updated_count = 0;

  for (const row of mappedRows) {
    let kind;
    if (_manualUpsertMode === true) {
      kind = await upsertOneManual(db, row);
    } else if (_manualUpsertMode === false) {
      kind = await upsertOneConflict(db, row);
    } else {
      try {
        kind = await upsertOneConflict(db, row);
        _manualUpsertMode = false;
      } catch (e) {
        const msg = e.message || '';
        if (/no unique or exclusion constraint matching/i.test(msg) || /ON CONFLICT/i.test(msg)) {
          console.warn(
            '[google-ads-sync] WARN no UNIQUE(campaign_id, date); using UPDATE/INSERT fallback. Recommend migration 038_campaign_costs_unique_campaign_date.sql'
          );
          _manualUpsertMode = true;
          kind = await upsertOneManual(db, row);
        } else {
          throw e;
        }
      }
    }
    if (kind === 'insert') created_count += 1;
    else updated_count += 1;
  }

  return { created_count, updated_count };
}

/**
 * Upsert campaign-level daily rows into ad_platform_daily_metrics (Google).
 * Unmapped Google campaigns still get a row (campaign_id NULL, campaign_external_id set).
 * @param {Array<object>} fullRows from fetchGoogleAdsCampaignDailyRows
 * @param {Awaited<ReturnType<typeof mapRowsToLocalCampaigns>>} mapResult
 */
async function upsertAdPlatformDailyMetricsFromGoogle(fullRows, mapResult, db = pool) {
  if (!fullRows.length) return { processed: 0, skipped: false };

  const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
  if (!/^\d{10}$/.test(customerId)) {
    console.warn('[google-ads-sync] skip ad_platform_daily_metrics: invalid GOOGLE_ADS_CUSTOMER_ID');
    return { processed: 0, skipped: true };
  }

  const gclidToCampaignId = new Map();
  for (const m of mapResult.mapped) {
    gclidToCampaignId.set(String(m.google_campaign_id || '').trim(), m.campaign_id);
  }

  let processed = 0;
  let tableMissing = false;

  for (const r of fullRows) {
    const gid = String(r.google_campaign_id || '').trim();
    const campaignId = gclidToCampaignId.get(gid) || null;
    const rawJson = JSON.stringify({
      google_campaign_name: r.google_campaign_name,
      google_campaign_id: gid,
      date: r.date,
      sync: 'google-ads-sync',
      grain: 'campaign_daily',
    });

    try {
      await db.query(
        `INSERT INTO ad_platform_daily_metrics (
           metric_date, platform, account_external_id, campaign_id, campaign_external_id,
           ad_group_external_id, ad_external_id, creative_id, currency_code,
           impressions, clicks, cost, conversions, conversion_value, raw_payload_json, created_by
         ) VALUES (
           $1::date, 'google', $2, $3, $4, '', '', NULL, 'AUD',
           $5, $6, $7, $8, $9, $10::jsonb, 'google-ads-sync'
         )
         ON CONFLICT (metric_date, platform, account_external_id, campaign_external_id, ad_group_external_id, ad_external_id)
         DO UPDATE SET
           campaign_id = COALESCE(EXCLUDED.campaign_id, ad_platform_daily_metrics.campaign_id),
           impressions = EXCLUDED.impressions,
           clicks = EXCLUDED.clicks,
           cost = EXCLUDED.cost,
           conversions = EXCLUDED.conversions,
           conversion_value = EXCLUDED.conversion_value,
           raw_payload_json = EXCLUDED.raw_payload_json,
           updated_at = NOW(),
           created_by = EXCLUDED.created_by`,
        [
          r.date,
          customerId,
          campaignId,
          gid,
          r.impressions,
          r.clicks,
          r.spend,
          r.conversions,
          r.conversion_value,
          rawJson,
        ]
      );
      processed += 1;
    } catch (e) {
      if (/ad_platform_daily_metrics|does not exist/i.test(e.message || '')) {
        if (!tableMissing) {
          console.warn('[google-ads-sync] ad_platform_daily_metrics missing; run migration 045:', e.message);
          tableMissing = true;
        }
        return { processed: 0, skipped: true };
      }
      throw e;
    }
  }

  return { processed, skipped: false };
}

function buildSummaryBase({
  sample_skipped,
  api_version,
  customer_id_masked,
  auto_created_count,
  backfill_google_id_count,
}) {
  return {
    sample_skipped: sample_skipped.slice(0, 15),
    api_version,
    customer_id_masked,
    auto_created_count,
    backfill_google_id_count,
  };
}

/**
 * @param {object} [opts]
 * @param {import('pg').Pool} [opts.db]
 * @param {boolean} [opts.dryRun]
 * @returns {Promise<object>}
 */
async function syncGoogleAdsCosts(opts = {}) {
  const db = opts.db || pool;
  const dryRun =
    opts.dryRun === true ||
    process.env.GOOGLE_ADS_SYNC_DRY_RUN === '1' ||
    String(process.env.GOOGLE_ADS_SYNC_DRY_RUN || '').toLowerCase() === 'true';

  const date = getTargetDate();
  const autoCreate = isAutoCreateCampaignsEnabled();
  const customerMasked = maskCustomerId(process.env.GOOGLE_ADS_CUSTOMER_ID);
  const ver = apiVersion();

  let runId = null;
  try {
    runId = await insertGoogleAdsSyncRun(db, { dryRun, targetDate: date });
  } catch (e) {
    if (/column .* does not exist/i.test(e.message || '')) {
      console.warn(
        '[google-ads-sync] WARN sync_runs extension missing; run 039. Continuing without run log:',
        e.message
      );
    } else {
      throw e;
    }
  }

  const fail = async (err) => {
    const msg = err.message || String(err);
    await safeFinishGoogleAdsSyncRun(db, runId, {
      status: 'failed',
      fetched_count: 0,
      mapped_count: 0,
      skipped_count: 0,
      created_count: 0,
      updated_count: 0,
      summary: {
        ...buildSummaryBase({
          sample_skipped: [],
          api_version: ver,
          customer_id_masked: customerMasked,
          auto_created_count: 0,
          backfill_google_id_count: 0,
        }),
        dry_run: dryRun,
      },
      error_message: msg.slice(0, 10000),
    });
  };

  let rows = [];
  let fetched_count = 0;
  let merged = [];
  let skipped = [];
  let auto_created_count = 0;
  let backfill_google_id_count = 0;
  let created_count = 0;
  let updated_count = 0;
  let metrics_processed = 0;
  let metrics_skipped = false;

  try {
    assertGoogleAdsEnv();
    const fullRows = await fetchGoogleAdsCampaignDailyRows(date);
    fetched_count = fullRows.length;
    rows = fullRows.map((r) => ({
      google_campaign_id: r.google_campaign_id,
      google_campaign_name: r.google_campaign_name,
      date: r.date,
      spend: r.spend,
    }));

    const mapResult = await mapRowsToLocalCampaigns(rows, db, { autoCreateCampaigns: autoCreate });
    skipped = mapResult.skipped;
    auto_created_count = mapResult.auto_created_count;
    backfill_google_id_count = mapResult.backfill_google_id_count;

    const byCrmDay = new Map();
    for (const m of mapResult.mapped) {
      const k = `${m.campaign_id}|${m.date}`;
      const cur = byCrmDay.get(k);
      if (cur) {
        cur.spend = Math.round((cur.spend + m.spend) * 100) / 100;
      } else {
        byCrmDay.set(k, { ...m });
      }
    }
    merged = [...byCrmDay.values()];
    const mapped_count = merged.length;
    const skipped_count = skipped.length;

    if (!dryRun && merged.length > 0) {
      const w = await upsertCampaignCosts(merged, db);
      created_count = w.created_count;
      updated_count = w.updated_count;
    }

    if (!dryRun && fullRows.length > 0) {
      const m = await upsertAdPlatformDailyMetricsFromGoogle(fullRows, mapResult, db);
      metrics_processed = m.processed || 0;
      metrics_skipped = Boolean(m.skipped);
    }

    const sample_skipped = skipped.slice(0, 15);
    const summaryPayload = {
      ...buildSummaryBase({
        sample_skipped,
        api_version: ver,
        customer_id_masked: customerMasked,
        auto_created_count,
        backfill_google_id_count,
      }),
      dry_run: dryRun,
      ad_platform_metrics_grain: 'campaign_daily',
      ad_platform_metrics_processed: metrics_processed,
      ad_platform_metrics_skipped: metrics_skipped,
    };

    const status =
      skipped_count > 0 && mapped_count > 0
        ? 'partial'
        : skipped_count > 0 && mapped_count === 0 && fetched_count > 0
          ? 'partial'
          : 'success';

    await safeFinishGoogleAdsSyncRun(db, runId, {
      status,
      fetched_count,
      mapped_count,
      skipped_count,
      created_count: dryRun ? 0 : created_count,
      updated_count: dryRun ? 0 : updated_count,
      summary: summaryPayload,
      error_message: null,
    });

    return {
      date,
      fetched_count,
      mapped_count,
      skipped_count,
      auto_created_count,
      backfill_google_id_count,
      created_count: dryRun ? 0 : created_count,
      updated_count: dryRun ? 0 : updated_count,
      ad_platform_metrics_processed: dryRun ? 0 : metrics_processed,
      ad_platform_metrics_skipped: metrics_skipped,
      dry_run: dryRun,
      sample_skipped,
      sync_run_id: runId,
      status,
    };
  } catch (err) {
    await fail(err);
    throw err;
  }
}

/** @deprecated use syncGoogleAdsCosts */
async function syncGoogleAdsCostsToDb(opts) {
  return syncGoogleAdsCosts(opts);
}

module.exports = {
  getTargetDate,
  fetchGoogleAdsCampaignCosts,
  fetchGoogleAdsCampaignDailyRows,
  upsertAdPlatformDailyMetricsFromGoogle,
  mapRowsToLocalCampaigns,
  upsertCampaignCosts,
  syncGoogleAdsCosts,
  syncGoogleAdsCostsToDb,
  assertGoogleAdsEnv,
  microsToSpend,
  isAutoCreateCampaignsEnabled,
  /** Shared OAuth for Google Ads REST callers (e.g. publisher). */
  getAdsAccessToken,
  apiVersion,
};
