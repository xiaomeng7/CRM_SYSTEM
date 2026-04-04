const { pool } = require('../lib/db');
const { assertGoogleAdsEnv, getAdsAccessToken, apiVersion } = require('./googleAdsSync');

const PAID_STATUSES = new Set(['paid', 'complete', 'completed', 'closed']);

/**
 * Offline conversion event types (Google, v1):
 * - opportunity_won: CRM `opportunities.stage` first transitions to `won` (earlier signal).
 * - invoice_paid: invoice paid sync (stronger revenue signal).
 *
 * Conversion actions (env; per-type override, then global fallback):
 * - GOOGLE_ADS_OFFLINE_CONVERSION_ACTION_OPPORTUNITY_WON
 * - GOOGLE_ADS_OFFLINE_CONVERSION_ACTION_INVOICE_PAID  (or legacy GOOGLE_ADS_OFFLINE_CONVERSION_ACTION)
 *
 * Auto-retry policy (all queued Google offline rows, v2):
 * - Rows are claimed with status=processing (FOR UPDATE SKIP LOCKED) to avoid duplicate uploads.
 * - Stale processing (>30m) is reset to pending at the start of each upload run.
 * - Exponential backoff from last failure: 1m, 2m, 4m, 8m, … capped at 6h (last_retry_at set when scheduling).
 * - After MAX_AUTO_UPLOAD_ATTEMPTS upload failures, status stays failed with retry_count at cap (no more auto picks).
 * - Non-retryable failures: failed immediately with retry_count = MAX (no further picks).
 * - Skipped rows stay skipped — not retried.
 */
const MAX_AUTO_UPLOAD_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 60 * 1000;
const BACKOFF_MAX_MS = 6 * 60 * 60 * 1000;
const STALE_PROCESSING_MS = 30 * 60 * 1000;

const SYNC_TYPE_OFFLINE_UPLOAD = 'google_offline_conversion_upload';
const RUN_TYPE_OFFLINE_UPLOAD = 'offline_upload';

function isLikelyGclid(v) {
  const s = String(v || '').trim();
  return /^[A-Za-z0-9_-]{10,255}$/.test(s);
}

function inferGoogleFromLeadRow(row) {
  const text = `${row?.utm_source || ''} ${row?.source || ''}`.toLowerCase();
  if (/google|adwords|gclid/.test(text)) return true;
  return false;
}

function getConversionActionConfig(eventType) {
  const key = String(eventType || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const byType =
    process.env[`GOOGLE_ADS_OFFLINE_CONVERSION_ACTION_${key}`] ||
    process.env.GOOGLE_ADS_OFFLINE_CONVERSION_ACTION;
  const action = String(byType || '').trim();
  if (!action) return { actionResourceName: null, actionName: null };
  const actionName = action.includes('/') ? action.split('/').pop() : action;
  return {
    actionResourceName: action,
    actionName,
  };
}

function formatGoogleConversionDateTime(ts) {
  const d = ts ? new Date(ts) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  const mm = pad(d.getUTCMonth() + 1);
  const dd = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mi = pad(d.getUTCMinutes());
  const ss = pad(d.getUTCSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}+00:00`;
}

/** HTTP layer: 5xx, 429, 408, 401/403 (token) are treated as retryable; other 4xx usually not. */
function isRetryableHttpStatus(status) {
  const n = Number(status);
  if (!Number.isFinite(n) || n === 0) return true;
  if (n === 429 || n === 408) return true;
  if (n >= 500 && n <= 599) return true;
  if (n === 401 || n === 403) return true;
  return false;
}

/**
 * After incrementing retry_count to `newRetryCount`, when should we try again?
 * Returns null if this failure exhausted auto-retries (caller leaves status=failed, next_retry_at NULL).
 */
function computeNextRetryAt(newRetryCount) {
  if (newRetryCount >= MAX_AUTO_UPLOAD_ATTEMPTS) return null;
  const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (newRetryCount - 1));
  return new Date(Date.now() + delay);
}

function backoffPreviewMinutes() {
  const out = [];
  for (let k = 1; k < MAX_AUTO_UPLOAD_ATTEMPTS; k += 1) {
    out.push(Math.round(Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (k - 1)) / 60000));
  }
  return out;
}

async function recoverStaleProcessingRows(db) {
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);
  try {
    await db.query(
      `UPDATE google_offline_conversion_events
       SET status = 'pending',
           updated_at = NOW()
       WHERE status = 'processing'
         AND COALESCE(last_attempt_at, created_at) < $1::timestamptz`,
      [staleBefore.toISOString()]
    );
  } catch (e) {
    if (/chk_google_offline_status|processing/i.test(String(e.message || ''))) {
      console.warn(
        '[google-offline] 需要执行 migration 049（npm run db:google-offline-processing-migration）。recoverStaleProcessing 已跳过:',
        e.message
      );
    }
  }
}

/**
 * Atomically claim up to `limit` eligible rows as processing (SKIP LOCKED).
 * Falls back to legacy SELECT if migration 049 not applied (no processing in CHECK).
 */
async function claimPendingOfflineConversions(db, limit) {
  await recoverStaleProcessingRows(db);
  try {
    const r = await db.query(
      `WITH picked AS (
         SELECT id
         FROM google_offline_conversion_events
         WHERE platform = 'google'
           AND (
             status = 'pending'
             OR (
               status = 'failed'
               AND retry_count < $1
               AND (next_retry_at IS NULL OR next_retry_at <= NOW())
             )
           )
         ORDER BY created_at ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED
       )
       UPDATE google_offline_conversion_events AS g
       SET status = 'processing',
           last_attempt_at = NOW(),
           updated_at = NOW()
       FROM picked
       WHERE g.id = picked.id
       RETURNING g.*`,
      [MAX_AUTO_UPLOAD_ATTEMPTS, limit]
    );
    return r.rows;
  } catch (e) {
    if (/chk_google_offline_status|processing|check constraint/i.test(String(e.message || ''))) {
      console.warn(
        '[google-offline] 需要执行 migration 049（npm run db:google-offline-processing-migration）。已降级为旧版 SELECT 认领，高并发下可能重复上传:',
        e.message
      );
      const r2 = await db.query(
        `SELECT *
         FROM google_offline_conversion_events
         WHERE platform = 'google'
           AND (
             status = 'pending'
             OR (
               status = 'failed'
               AND retry_count < $1
               AND (next_retry_at IS NULL OR next_retry_at <= NOW())
             )
           )
         ORDER BY created_at ASC
         LIMIT $2`,
        [MAX_AUTO_UPLOAD_ATTEMPTS, limit]
      );
      return r2.rows;
    }
    throw e;
  }
}

async function insertOfflineUploadSyncRun(db, { dryRun }) {
  try {
    const r = await db.query(
      `INSERT INTO sync_runs (
         sync_type, mode, dry_run, status,
         source, run_type, target_date, created_by,
         fetched_count, mapped_count, created_count, updated_count, skipped_count
       ) VALUES (
         $1, 'batch', $2, 'running',
         $3, $4, NULL::date, $5,
         0, 0, 0, 0, 0
       ) RETURNING id`,
      [SYNC_TYPE_OFFLINE_UPLOAD, dryRun, 'google_ads', RUN_TYPE_OFFLINE_UPLOAD, 'google-offline-conversions']
    );
    return r.rows[0]?.id || null;
  } catch (e) {
    if (/sync_runs|column|does not exist/i.test(e.message || '')) {
      console.warn('[google-offline] sync_runs insert skipped:', e.message);
      return null;
    }
    throw e;
  }
}

async function finishOfflineUploadSyncRun(db, runId, payload) {
  if (!runId) return;
  try {
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
        payload.status,
        payload.fetched_count,
        payload.mapped_count,
        payload.skipped_count,
        payload.created_count,
        payload.updated_count,
        payload.summary != null ? JSON.stringify(payload.summary) : null,
        payload.error_message || null,
      ]
    );
  } catch (e) {
    console.warn('[google-offline] sync_runs finish failed:', e.message || e);
  }
}

function pickTrustedGclid(row) {
  const direct = String(row?.attribution_gclid || row?.lead_gclid || '').trim();
  if (direct && isLikelyGclid(direct)) {
    return { gclid: direct, source: row?.attribution_gclid ? 'attribution_gclid' : 'lead_gclid' };
  }

  // Conservative fallback: click_id can be used only if source is clearly Google-like.
  const clickId = String(row?.attribution_click_id || row?.lead_click_id || '').trim();
  const inferredGoogle = row?.attribution_platform === 'google' || inferGoogleFromLeadRow(row);
  if (clickId && inferredGoogle && isLikelyGclid(clickId)) {
    return {
      gclid: clickId,
      source: row?.attribution_click_id ? 'fallback_attribution_click_id' : 'fallback_lead_click_id',
    };
  }
  return { gclid: null, source: clickId ? 'non_google_or_invalid_click_id' : 'missing_click_id' };
}

/**
 * Ad / LP intake snapshot for queue payload: opportunity snapshot (intake_attribution) wins over live lead row.
 */
function mergeIntakeSnapshotForPayload(row) {
  const snap =
    row?.intake_attribution && typeof row.intake_attribution === 'object' && !Array.isArray(row.intake_attribution)
      ? row.intake_attribution
      : {};
  const pick = (snapKey, leadKey) => {
    const vSnap = snap[snapKey];
    if (vSnap != null && String(vSnap).trim() !== '') return String(vSnap).trim();
    const vLead = row?.[leadKey];
    if (vLead != null && String(vLead).trim() !== '') return String(vLead).trim();
    return null;
  };
  return {
    gclid: pick('gclid', 'lead_gclid'),
    utm_campaign: pick('utm_campaign', 'lead_utm_campaign'),
    utm_content: pick('utm_content', 'lead_utm_content'),
    landing_page_version: pick('landing_page_version', 'lead_landing_page_version'),
    creative_version: pick('creative_version', 'lead_creative_version'),
  };
}

/** Enqueue-time GCLID tier for ads tuning (NULL when no trusted gclid). */
function inferGclidQuality(gclidPick) {
  if (!gclidPick || !gclidPick.gclid) return null;
  const s = gclidPick.source;
  if (s === 'attribution_gclid') return 'high';
  if (s === 'lead_gclid') return 'medium';
  if (s === 'fallback_attribution_click_id' || s === 'fallback_lead_click_id') return 'low';
  return 'low';
}

async function fetchInvoiceConversionContext(db, invoiceId) {
  try {
    const r = await db.query(
      `SELECT
         i.id AS invoice_id,
         i.account_id,
         i.opportunity_id,
         i.amount,
         i.paid_at,
         i.status AS invoice_status,
         o.lead_id,
         o.contact_id,
         o.intake_attribution,
         l.campaign_id,
         l.click_id AS lead_click_id,
         l.gclid AS lead_gclid,
         l.utm_source,
         l.source,
         l.utm_campaign AS lead_utm_campaign,
         l.utm_content AS lead_utm_content,
         l.landing_page_version AS lead_landing_page_version,
         l.creative_version AS lead_creative_version,
         lae.click_id AS attribution_click_id,
         lae.gclid AS attribution_gclid,
         lae.platform AS attribution_platform
       FROM invoices i
       LEFT JOIN opportunities o ON o.id = i.opportunity_id
       LEFT JOIN leads l ON l.id = o.lead_id
       LEFT JOIN LATERAL (
         SELECT click_id, gclid, platform
         FROM lead_attribution_events
         WHERE lead_id = o.lead_id
           AND click_id IS NOT NULL
         ORDER BY
           CASE WHEN NULLIF(TRIM(COALESCE(gclid, '')), '') IS NOT NULL THEN 0 ELSE 1 END,
           created_at DESC
         LIMIT 1
       ) lae ON TRUE
       WHERE i.id = $1::uuid
       LIMIT 1`,
      [invoiceId]
    );
    return r.rows[0] || null;
  } catch (e) {
    const msg = String(e.message || '');
    if (!/lead_attribution_events|gclid/i.test(msg)) throw e;
    try {
      const fallback = await db.query(
        `SELECT
           i.id AS invoice_id,
           i.account_id,
           i.opportunity_id,
           i.amount,
           i.paid_at,
           i.status AS invoice_status,
           o.lead_id,
           o.contact_id,
           o.intake_attribution,
           l.campaign_id,
           l.click_id AS lead_click_id,
           l.gclid AS lead_gclid,
           l.utm_source,
           l.source,
           l.utm_campaign AS lead_utm_campaign,
           l.utm_content AS lead_utm_content,
           l.landing_page_version AS lead_landing_page_version,
           l.creative_version AS lead_creative_version,
           NULL::text AS attribution_click_id,
           NULL::text AS attribution_gclid,
           NULL::text AS attribution_platform
         FROM invoices i
         LEFT JOIN opportunities o ON o.id = i.opportunity_id
         LEFT JOIN leads l ON l.id = o.lead_id
         WHERE i.id = $1::uuid
         LIMIT 1`,
        [invoiceId]
      );
      return fallback.rows[0] || null;
    } catch (e2) {
      if (!/gclid/i.test(String(e2.message || ''))) throw e2;
      const finalFallback = await db.query(
        `SELECT
           i.id AS invoice_id,
           i.account_id,
           i.opportunity_id,
           i.amount,
           i.paid_at,
           i.status AS invoice_status,
           o.lead_id,
           o.contact_id,
           o.intake_attribution,
           l.campaign_id,
           l.click_id AS lead_click_id,
           NULL::text AS lead_gclid,
           l.utm_source,
           l.source,
           l.utm_campaign AS lead_utm_campaign,
           l.utm_content AS lead_utm_content,
           l.landing_page_version AS lead_landing_page_version,
           l.creative_version AS lead_creative_version,
           NULL::text AS attribution_click_id,
           NULL::text AS attribution_gclid,
           NULL::text AS attribution_platform
         FROM invoices i
         LEFT JOIN opportunities o ON o.id = i.opportunity_id
         LEFT JOIN leads l ON l.id = o.lead_id
         WHERE i.id = $1::uuid
         LIMIT 1`,
        [invoiceId]
      );
      return finalFallback.rows[0] || null;
    }
  }
}

/**
 * opportunity_won rule (v1, auditable):
 * - The opportunity row exists with stage = 'won' (set by CRM API `updateStage`, automation `advanceOpportunityStage`, etc.).
 * - Conversion time: COALESCE(won_at, updated_at) on that row.
 * - Value (Phase 3): quotes.amount (best accepted/ordered row) → else opportunities.value_estimate → else 0.
 *   value_source on row: quote | estimate | fallback (see source_payload_json).
 */
async function fetchOpportunityWonContext(db, opportunityId) {
  const quoteSelect = `
      (
        SELECT q.amount
        FROM quotes q
        WHERE q.opportunity_id = o.id
        ORDER BY
          (q.accepted_at IS NULL),
          q.accepted_at DESC NULLS LAST,
          CASE WHEN LOWER(TRIM(COALESCE(q.status, ''))) IN ('accepted', 'approved') THEN 0 ELSE 1 END,
          q.updated_at DESC NULLS LAST
        LIMIT 1
      ) AS quote_amount`;
  const q = `
    SELECT
      o.id AS opportunity_id,
      o.account_id,
      o.contact_id,
      o.lead_id,
      o.stage,
      o.won_at,
      o.updated_at,
      o.value_estimate,
      o.intake_attribution,
      ${quoteSelect},
      l.campaign_id,
      l.click_id AS lead_click_id,
      l.gclid AS lead_gclid,
      l.utm_source,
      l.source,
      l.utm_campaign AS lead_utm_campaign,
      l.utm_content AS lead_utm_content,
      l.landing_page_version AS lead_landing_page_version,
      l.creative_version AS lead_creative_version,
      lae.click_id AS attribution_click_id,
      lae.gclid AS attribution_gclid,
      lae.platform AS attribution_platform
    FROM opportunities o
    LEFT JOIN leads l ON l.id = o.lead_id
    LEFT JOIN LATERAL (
      SELECT click_id, gclid, platform
      FROM lead_attribution_events
      WHERE lead_id = o.lead_id
      ORDER BY
        CASE WHEN NULLIF(TRIM(COALESCE(gclid, '')), '') IS NOT NULL THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 1
    ) lae ON TRUE
    WHERE o.id = $1::uuid
    LIMIT 1
  `;
  try {
    const r = await db.query(q, [opportunityId]);
    return r.rows[0] || null;
  } catch (e) {
    const msg = String(e.message || '');
    if (!/lead_attribution_events|gclid|quotes|quote/i.test(msg)) throw e;
    try {
      const r2 = await db.query(
        `SELECT
           o.id AS opportunity_id,
           o.account_id,
           o.contact_id,
           o.lead_id,
           o.stage,
           o.won_at,
           o.updated_at,
           o.value_estimate,
           o.intake_attribution,
           ${quoteSelect},
           l.campaign_id,
           l.click_id AS lead_click_id,
           l.gclid AS lead_gclid,
           l.utm_source,
           l.source,
           l.utm_campaign AS lead_utm_campaign,
           l.utm_content AS lead_utm_content,
           l.landing_page_version AS lead_landing_page_version,
           l.creative_version AS lead_creative_version,
           NULL::text AS attribution_click_id,
           NULL::text AS attribution_gclid,
           NULL::text AS attribution_platform
         FROM opportunities o
         LEFT JOIN leads l ON l.id = o.lead_id
         WHERE o.id = $1::uuid
         LIMIT 1`,
        [opportunityId]
      );
      return r2.rows[0] || null;
    } catch (e2) {
      if (!/quotes|quote/i.test(String(e2.message || ''))) throw e2;
      const r3 = await db.query(
        `SELECT
           o.id AS opportunity_id,
           o.account_id,
           o.contact_id,
           o.lead_id,
           o.stage,
           o.won_at,
           o.updated_at,
           o.value_estimate,
           o.intake_attribution,
           NULL::numeric AS quote_amount,
           l.campaign_id,
           l.click_id AS lead_click_id,
           l.gclid AS lead_gclid,
           l.utm_source,
           l.source,
           l.utm_campaign AS lead_utm_campaign,
           l.utm_content AS lead_utm_content,
           l.landing_page_version AS lead_landing_page_version,
           l.creative_version AS lead_creative_version,
           NULL::text AS attribution_click_id,
           NULL::text AS attribution_gclid,
           NULL::text AS attribution_platform
         FROM opportunities o
         LEFT JOIN leads l ON l.id = o.lead_id
         WHERE o.id = $1::uuid
         LIMIT 1`,
        [opportunityId]
      );
      return r3.rows[0] || null;
    }
  }
}

async function enqueueOpportunityWonConversionEvent(opportunityId, opts = {}) {
  const db = opts.db || pool;
  const sourcePayload = opts.sourcePayload || {};
  const row = await fetchOpportunityWonContext(db, opportunityId);
  if (!row) {
    return { ok: false, skipped: true, reason: 'opportunity_not_found' };
  }
  if (String(row.stage || '').trim().toLowerCase() !== 'won') {
    return { ok: false, skipped: true, reason: 'opportunity_not_won' };
  }

  const eventType = 'opportunity_won';
  const dedupeKey = `${eventType}:${row.opportunity_id}`;
  const conversionTime = row.won_at || row.updated_at || new Date().toISOString();
  const quoteRaw = row.quote_amount;
  const quoteNum =
    quoteRaw != null && Number.isFinite(Number(quoteRaw)) && Number(quoteRaw) > 0 ? Number(quoteRaw) : null;
  const estRaw = row.value_estimate;
  const estNum =
    estRaw != null && Number.isFinite(Number(estRaw)) && Number(estRaw) > 0 ? Number(estRaw) : null;
  let conversionValue = 0;
  let valueSource = 'fallback';
  if (quoteNum != null) {
    conversionValue = quoteNum;
    valueSource = 'quote';
  } else if (estNum != null) {
    conversionValue = estNum;
    valueSource = 'estimate';
  }
  const clickId = row.attribution_click_id || row.lead_click_id || null;
  const gclidPick = pickTrustedGclid(row);
  const gclid = gclidPick.gclid;
  const gclidQuality = inferGclidQuality(gclidPick);
  const actionCfg = getConversionActionConfig(eventType);

  const status = gclid && actionCfg.actionResourceName ? 'pending' : 'skipped';
  let errorMessage = null;
  if (!gclid) errorMessage = 'missing_trusted_gclid';
  else if (!actionCfg.actionResourceName) {
    errorMessage = 'missing_conversion_action_resource_name';
  }

  const valueNote =
    valueSource === 'quote'
      ? 'conversion_value from quotes.amount (preferred over estimate; not paid invoice).'
      : valueSource === 'estimate'
        ? 'conversion_value from opportunities.value_estimate (no positive quote amount).'
        : 'conversion_value=0; no positive quote amount and no positive estimate.';

  const intakeInherited = mergeIntakeSnapshotForPayload(row);

  const payload = {
    source: opts.source || 'crm',
    opportunity_id: row.opportunity_id,
    stage: row.stage,
    won_at: row.won_at,
    lead_id: row.lead_id,
    click_id: clickId,
    lead_gclid: row.lead_gclid || null,
    attribution_gclid: row.attribution_gclid || null,
    gclid_source: gclidPick.source,
    gclid_quality: gclidQuality,
    quote_amount: quoteNum,
    value_estimate: estRaw != null && Number.isFinite(Number(estRaw)) ? Number(estRaw) : null,
    value_source: valueSource,
    value_note: valueNote,
    intake_inherited: intakeInherited,
    ...sourcePayload,
  };

  const baseParams = [
    status,
    eventType,
    row.lead_id || null,
    row.contact_id || null,
    row.account_id || null,
    row.opportunity_id,
    row.campaign_id || null,
    clickId,
    gclid,
    actionCfg.actionName,
    actionCfg.actionResourceName,
    conversionTime,
    conversionValue,
    JSON.stringify(payload),
    errorMessage,
    dedupeKey,
  ];

  try {
    let ins;
    try {
      ins = await db.query(
        `INSERT INTO google_offline_conversion_events (
           status, event_type, lead_id, contact_id, account_id, opportunity_id, invoice_id, campaign_id,
           click_id, gclid, conversion_action_name, conversion_action_resource_name, conversion_time,
           conversion_value, currency_code, platform, source_payload_json, error_message, dedupe_key,
           gclid_quality, value_source
         ) VALUES (
           $1, $2, $3, $4, $5, $6, NULL, $7,
           $8, $9, $10, $11, $12,
           $13, 'AUD', 'google', $14::jsonb, $15, $16,
           $17, $18
         )
         ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL
         DO UPDATE SET
           status = CASE
             WHEN google_offline_conversion_events.status = 'sent' THEN google_offline_conversion_events.status
             ELSE EXCLUDED.status
           END,
           click_id = COALESCE(EXCLUDED.click_id, google_offline_conversion_events.click_id),
           gclid = COALESCE(EXCLUDED.gclid, google_offline_conversion_events.gclid),
           conversion_action_name = COALESCE(EXCLUDED.conversion_action_name, google_offline_conversion_events.conversion_action_name),
           conversion_action_resource_name = COALESCE(EXCLUDED.conversion_action_resource_name, google_offline_conversion_events.conversion_action_resource_name),
           conversion_time = COALESCE(EXCLUDED.conversion_time, google_offline_conversion_events.conversion_time),
           conversion_value = COALESCE(EXCLUDED.conversion_value, google_offline_conversion_events.conversion_value),
           gclid_quality = COALESCE(EXCLUDED.gclid_quality, google_offline_conversion_events.gclid_quality),
           value_source = COALESCE(EXCLUDED.value_source, google_offline_conversion_events.value_source),
           source_payload_json = COALESCE(EXCLUDED.source_payload_json, google_offline_conversion_events.source_payload_json),
           error_message = EXCLUDED.error_message,
           updated_at = NOW()
         RETURNING id, status`,
        [...baseParams, gclidQuality, valueSource]
      );
    } catch (e) {
      if (!/gclid_quality|value_source|column/i.test(String(e.message || ''))) throw e;
      ins = await db.query(
        `INSERT INTO google_offline_conversion_events (
           status, event_type, lead_id, contact_id, account_id, opportunity_id, invoice_id, campaign_id,
           click_id, gclid, conversion_action_name, conversion_action_resource_name, conversion_time,
           conversion_value, currency_code, platform, source_payload_json, error_message, dedupe_key
         ) VALUES (
           $1, $2, $3, $4, $5, $6, NULL, $7,
           $8, $9, $10, $11, $12,
           $13, 'AUD', 'google', $14::jsonb, $15, $16
         )
         ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL
         DO UPDATE SET
           status = CASE
             WHEN google_offline_conversion_events.status = 'sent' THEN google_offline_conversion_events.status
             ELSE EXCLUDED.status
           END,
           click_id = COALESCE(EXCLUDED.click_id, google_offline_conversion_events.click_id),
           gclid = COALESCE(EXCLUDED.gclid, google_offline_conversion_events.gclid),
           conversion_action_name = COALESCE(EXCLUDED.conversion_action_name, google_offline_conversion_events.conversion_action_name),
           conversion_action_resource_name = COALESCE(EXCLUDED.conversion_action_resource_name, google_offline_conversion_events.conversion_action_resource_name),
           conversion_time = COALESCE(EXCLUDED.conversion_time, google_offline_conversion_events.conversion_time),
           conversion_value = COALESCE(EXCLUDED.conversion_value, google_offline_conversion_events.conversion_value),
           source_payload_json = COALESCE(EXCLUDED.source_payload_json, google_offline_conversion_events.source_payload_json),
           error_message = EXCLUDED.error_message,
           updated_at = NOW()
         RETURNING id, status`,
        baseParams
      );
    }
    return { ok: true, id: ins.rows[0]?.id, status: ins.rows[0]?.status, dedupe_key: dedupeKey, event_type: eventType };
  } catch (e) {
    if (/google_offline_conversion_events/i.test(e.message || '') && /does not exist/i.test(e.message || '')) {
      console.warn('[google-offline] table missing; run migration 046:', e.message);
      return { ok: false, skipped: true, reason: 'table_missing' };
    }
    throw e;
  }
}

/**
 * Fire-and-forget; never throws to caller.
 */
function scheduleOpportunityWonOfflineConversion(pool, opportunityId, extra = {}) {
  if (!opportunityId) return;
  setImmediate(async () => {
    try {
      const client = await pool.connect();
      try {
        await enqueueOpportunityWonConversionEvent(opportunityId, { db: client, ...extra });
      } finally {
        client.release();
      }
    } catch (e) {
      console.error('[google-offline] schedule opportunity_won failed:', e.message || e);
    }
  });
}

async function enqueueInvoicePaidConversionEvent(invoiceId, opts = {}) {
  const db = opts.db || pool;
  const sourcePayload = opts.sourcePayload || {};
  const row = await fetchInvoiceConversionContext(db, invoiceId);
  if (!row) {
    return { ok: false, skipped: true, reason: 'invoice_not_found' };
  }

  const statusNorm = String(row.invoice_status || '').trim().toLowerCase();
  const isPaid = row.paid_at != null || PAID_STATUSES.has(statusNorm);
  if (!isPaid) {
    return { ok: false, skipped: true, reason: 'invoice_not_paid' };
  }

  const eventType = 'invoice_paid';
  const dedupeKey = `${eventType}:${row.invoice_id}`;
  const conversionTime = row.paid_at || new Date().toISOString();
  const conversionValue = row.amount != null ? Number(row.amount) : 0;
  const clickId = row.attribution_click_id || row.lead_click_id || null;
  const gclidPick = pickTrustedGclid(row);
  const gclid = gclidPick.gclid;
  const gclidQuality = inferGclidQuality(gclidPick);
  const valueSource = 'invoice';
  const actionCfg = getConversionActionConfig(eventType);

  const status = gclid && actionCfg.actionResourceName ? 'pending' : 'skipped';
  let errorMessage = null;
  if (!clickId) errorMessage = 'missing_click_id';
  else if (!gclid) errorMessage = 'missing_trusted_gclid';
  else if (!actionCfg.actionResourceName) errorMessage = 'missing_conversion_action_resource_name';

  const intakeInherited = mergeIntakeSnapshotForPayload(row);

  const payload = {
    source: 'servicem8-sync',
    invoice_id: row.invoice_id,
    invoice_status: row.invoice_status,
    paid_at: row.paid_at,
    lead_id: row.lead_id,
    opportunity_id: row.opportunity_id || null,
    click_id: clickId,
    lead_gclid: row.lead_gclid || null,
    attribution_gclid: row.attribution_gclid || null,
    gclid_source: gclidPick.source,
    gclid_quality: gclidQuality,
    value_source: valueSource,
    intake_inherited: intakeInherited,
    ...sourcePayload,
  };

  const invBaseParams = [
    status,
    eventType,
    row.lead_id || null,
    row.contact_id || null,
    row.account_id || null,
    row.opportunity_id || null,
    row.invoice_id,
    row.campaign_id || null,
    clickId,
    gclid,
    actionCfg.actionName,
    actionCfg.actionResourceName,
    conversionTime,
    conversionValue,
    JSON.stringify(payload),
    errorMessage,
    dedupeKey,
  ];

  try {
    let ins;
    try {
      ins = await db.query(
        `INSERT INTO google_offline_conversion_events (
           status, event_type, lead_id, contact_id, account_id, opportunity_id, invoice_id, campaign_id,
           click_id, gclid, conversion_action_name, conversion_action_resource_name, conversion_time,
           conversion_value, currency_code, platform, source_payload_json, error_message, dedupe_key,
           gclid_quality, value_source
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8,
           $9, $10, $11, $12, $13,
           $14, 'AUD', 'google', $15::jsonb, $16, $17,
           $18, $19
         )
         ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL
         DO UPDATE SET
           -- keep sent rows immutable; allow retries for failed/skipped rows
           status = CASE
             WHEN google_offline_conversion_events.status = 'sent' THEN google_offline_conversion_events.status
             ELSE EXCLUDED.status
           END,
           click_id = COALESCE(EXCLUDED.click_id, google_offline_conversion_events.click_id),
           gclid = COALESCE(EXCLUDED.gclid, google_offline_conversion_events.gclid),
           conversion_action_name = COALESCE(EXCLUDED.conversion_action_name, google_offline_conversion_events.conversion_action_name),
           conversion_action_resource_name = COALESCE(EXCLUDED.conversion_action_resource_name, google_offline_conversion_events.conversion_action_resource_name),
           conversion_time = COALESCE(EXCLUDED.conversion_time, google_offline_conversion_events.conversion_time),
           conversion_value = COALESCE(EXCLUDED.conversion_value, google_offline_conversion_events.conversion_value),
           gclid_quality = COALESCE(EXCLUDED.gclid_quality, google_offline_conversion_events.gclid_quality),
           value_source = COALESCE(EXCLUDED.value_source, google_offline_conversion_events.value_source),
           source_payload_json = COALESCE(EXCLUDED.source_payload_json, google_offline_conversion_events.source_payload_json),
           error_message = EXCLUDED.error_message,
           updated_at = NOW()
         RETURNING id, status`,
        [...invBaseParams, gclidQuality, valueSource]
      );
    } catch (e) {
      if (!/gclid_quality|value_source|column/i.test(String(e.message || ''))) throw e;
      ins = await db.query(
        `INSERT INTO google_offline_conversion_events (
           status, event_type, lead_id, contact_id, account_id, opportunity_id, invoice_id, campaign_id,
           click_id, gclid, conversion_action_name, conversion_action_resource_name, conversion_time,
           conversion_value, currency_code, platform, source_payload_json, error_message, dedupe_key
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8,
           $9, $10, $11, $12, $13,
           $14, 'AUD', 'google', $15::jsonb, $16, $17
         )
         ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL
         DO UPDATE SET
           status = CASE
             WHEN google_offline_conversion_events.status = 'sent' THEN google_offline_conversion_events.status
             ELSE EXCLUDED.status
           END,
           click_id = COALESCE(EXCLUDED.click_id, google_offline_conversion_events.click_id),
           gclid = COALESCE(EXCLUDED.gclid, google_offline_conversion_events.gclid),
           conversion_action_name = COALESCE(EXCLUDED.conversion_action_name, google_offline_conversion_events.conversion_action_name),
           conversion_action_resource_name = COALESCE(EXCLUDED.conversion_action_resource_name, google_offline_conversion_events.conversion_action_resource_name),
           conversion_time = COALESCE(EXCLUDED.conversion_time, google_offline_conversion_events.conversion_time),
           conversion_value = COALESCE(EXCLUDED.conversion_value, google_offline_conversion_events.conversion_value),
           source_payload_json = COALESCE(EXCLUDED.source_payload_json, google_offline_conversion_events.source_payload_json),
           error_message = EXCLUDED.error_message,
           updated_at = NOW()
         RETURNING id, status`,
        invBaseParams
      );
    }
    return { ok: true, id: ins.rows[0]?.id, status: ins.rows[0]?.status, dedupe_key: dedupeKey };
  } catch (e) {
    if (/google_offline_conversion_events/i.test(e.message || '') && /does not exist/i.test(e.message || '')) {
      console.warn('[google-offline] table missing; run migration 046:', e.message);
      return { ok: false, skipped: true, reason: 'table_missing' };
    }
    throw e;
  }
}

async function uploadOneEvent(event) {
  if (String(process.env.GOOGLE_OFFLINE_UPLOAD_SIMULATE || '').trim() === '1') {
    return {
      status: 'sent',
      response: { simulated: true, event_id: event.id, note: 'GOOGLE_OFFLINE_UPLOAD_SIMULATE=1 (no Google API call)' },
      httpStatus: 200,
    };
  }

  const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
  const conversionAction = String(event.conversion_action_resource_name || '').trim();
  const gclid = String(event.gclid || '').trim();
  const conversionDateTime = formatGoogleConversionDateTime(event.conversion_time);
  const conversionValue = Number(event.conversion_value || 0);

  if (!conversionAction) {
    return { status: 'skipped', error: 'missing_conversion_action_resource_name', terminal: true };
  }
  if (!gclid) return { status: 'skipped', error: 'missing_gclid', terminal: true };
  if (!isLikelyGclid(gclid)) return { status: 'skipped', error: 'invalid_gclid_format', terminal: true };

  const body = {
    conversions: [
      {
        conversionAction,
        gclid,
        conversionDateTime,
        conversionValue,
        currencyCode: event.currency_code || 'AUD',
      },
    ],
    partialFailure: true,
    validateOnly: false,
  };

  let accessToken;
  try {
    accessToken = await getAdsAccessToken();
  } catch (e) {
    return {
      status: 'failed',
      error: `oauth: ${e.message || e}`,
      httpStatus: 0,
      retryable: true,
      response: null,
    };
  }

  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const loginCid = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '').replace(/-/g, '');
  const ver = apiVersion();
  const url = `https://googleads.googleapis.com/${ver}/customers/${customerId}:uploadClickConversions`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json',
  };
  if (loginCid && /^\d{10}$/.test(loginCid)) {
    headers['login-customer-id'] = loginCid;
  }

  let res;
  let text;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    text = await res.text();
  } catch (e) {
    return {
      status: 'failed',
      error: `network: ${e.message || e}`,
      httpStatus: 0,
      retryable: true,
      response: null,
    };
  }

  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = { raw: text };
  }

  const httpStatus = res.status;

  if (!res.ok) {
    return {
      status: 'failed',
      error: `Google upload HTTP ${httpStatus}: ${text.slice(0, 1200)}`,
      httpStatus,
      retryable: isRetryableHttpStatus(httpStatus),
      response: json,
    };
  }

  if (json && json.partialFailureError) {
    return {
      status: 'failed',
      error: `Google partialFailureError: ${JSON.stringify(json.partialFailureError).slice(0, 1600)}`,
      httpStatus,
      retryable: false,
      response: json,
    };
  }

  return { status: 'sent', response: json, httpStatus };
}

async function uploadPendingGoogleOfflineConversions(opts = {}) {
  const db = opts.db || pool;
  const limit = Math.min(Math.max(parseInt(String(opts.limit || '20'), 10) || 20, 1), 200);
  const dryRun = opts.dryRun === true || String(process.env.GOOGLE_OFFLINE_UPLOAD_DRY_RUN || '').trim() === '1';

  const simulateUpload = String(process.env.GOOGLE_OFFLINE_UPLOAD_SIMULATE || '').trim() === '1';
  if (!dryRun && !simulateUpload) {
    try {
      assertGoogleAdsEnv();
    } catch (e) {
      const err = new Error(e.message || String(e));
      err.code = 'MISSING_GOOGLE_ADS_ENV';
      throw err;
    }
  }

  const runId = dryRun ? null : await insertOfflineUploadSyncRun(db, { dryRun: false });

  const eligibilitySql = `
     FROM google_offline_conversion_events
     WHERE platform = 'google'
       AND (
         status = 'pending'
         OR (
           status = 'failed'
           AND retry_count < $1
           AND (next_retry_at IS NULL OR next_retry_at <= NOW())
         )
       )
     ORDER BY created_at ASC
     LIMIT $2`;

  let rows;
  if (dryRun) {
    const rDry = await db.query(`SELECT * ${eligibilitySql}`, [MAX_AUTO_UPLOAD_ATTEMPTS, limit]);
    rows = rDry.rows;
  } else {
    rows = await claimPendingOfflineConversions(db, limit);
  }

  const out = {
    processed: 0,
    sent: 0,
    failed_retry_scheduled: 0,
    failed_exhausted: 0,
    skipped: 0,
    dry_run: dryRun,
    limit,
    sync_run_id: runId,
    sample_errors: [],
    by_event_type: {},
  };

  const bumpEventType = (eventType, field) => {
    const k = String(eventType || 'unknown');
    if (!out.by_event_type[k]) {
      out.by_event_type[k] = {
        sent: 0,
        skipped: 0,
        failed_retry_scheduled: 0,
        failed_exhausted: 0,
        would_process: 0,
      };
    }
    out.by_event_type[k][field] += 1;
  };

  const pushSample = (msg) => {
    if (!msg || out.sample_errors.length >= 8) return;
    out.sample_errors.push(String(msg).slice(0, 500));
  };

  for (const ev of rows) {
    out.processed += 1;

    if (dryRun) {
      bumpEventType(ev.event_type, 'would_process');
      pushSample(
        `dry_run would_process id=${ev.id} event_type=${ev.event_type} status=${ev.status} retry_count=${ev.retry_count}`
      );
      continue;
    }

    let result;
    try {
      result = await uploadOneEvent(ev);
    } catch (e) {
      result = { status: 'failed', error: e.message || String(e), retryable: true, httpStatus: 0, response: null };
    }

    if (result.status === 'sent') {
      out.sent += 1;
      bumpEventType(ev.event_type, 'sent');
      await db.query(
        `UPDATE google_offline_conversion_events
         SET status = 'sent',
             response_payload_json = $2::jsonb,
             error_message = NULL,
             last_attempt_at = NOW(),
             sent_at = NOW(),
             next_retry_at = NULL,
             updated_at = NOW()
         WHERE id = $1::uuid`,
        [ev.id, JSON.stringify(result.response || null)]
      );
      continue;
    }

    if (result.status === 'skipped') {
      out.skipped += 1;
      bumpEventType(ev.event_type, 'skipped');
      pushSample(`${ev.event_type}: ${result.error}`);
      await db.query(
        `UPDATE google_offline_conversion_events
         SET status = 'skipped',
             response_payload_json = $2::jsonb,
             error_message = $3,
             last_attempt_at = NOW(),
             next_retry_at = NULL,
             updated_at = NOW()
         WHERE id = $1::uuid`,
        [ev.id, JSON.stringify(result.response || null), result.error || null]
      );
      continue;
    }

    // failed
    const errText = result.error || 'unknown_error';
    pushSample(errText);
    const retryable = result.retryable !== false;
    const newRetryCount = Number(ev.retry_count || 0) + 1;

    const terminalCount = !retryable ? MAX_AUTO_UPLOAD_ATTEMPTS : newRetryCount;
    if (!retryable || newRetryCount >= MAX_AUTO_UPLOAD_ATTEMPTS) {
      out.failed_exhausted += 1;
      bumpEventType(ev.event_type, 'failed_exhausted');
      await db.query(
        `UPDATE google_offline_conversion_events
         SET status = 'failed',
             response_payload_json = $2::jsonb,
             error_message = $3,
             retry_count = $4,
             last_attempt_at = NOW(),
             next_retry_at = NULL,
             updated_at = NOW()
         WHERE id = $1::uuid`,
        [ev.id, JSON.stringify(result.response || null), errText, terminalCount]
      );
      continue;
    }

    const nextAt = computeNextRetryAt(newRetryCount);
    out.failed_retry_scheduled += 1;
    bumpEventType(ev.event_type, 'failed_retry_scheduled');
    await db.query(
      `UPDATE google_offline_conversion_events
       SET status = 'failed',
           response_payload_json = $2::jsonb,
           error_message = $3,
           retry_count = $4,
           last_attempt_at = NOW(),
           next_retry_at = $5::timestamptz,
           last_retry_at = NOW(),
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [ev.id, JSON.stringify(result.response || null), errText, newRetryCount, nextAt]
    );
  }

  const summaryPayload = {
    runner: 'google_offline_conversion_upload',
    dry_run: dryRun,
    limit,
    max_auto_attempts: MAX_AUTO_UPLOAD_ATTEMPTS,
    backoff_minutes: backoffPreviewMinutes(),
    ...out,
    permanent_failed: out.failed_exhausted,
  };

  if (runId) {
    await finishOfflineUploadSyncRun(db, runId, {
      status: 'success',
      fetched_count: out.processed,
      mapped_count: 0,
      skipped_count: out.skipped,
      created_count: out.sent,
      updated_count: out.failed_retry_scheduled + out.failed_exhausted,
      summary: summaryPayload,
      error_message: null,
    });
  }

  return summaryPayload;
}

async function listGoogleOfflineConversionEvents(filters = {}, db = pool) {
  const limit = Math.min(Math.max(parseInt(String(filters.limit || '100'), 10) || 100, 1), 500);
  const params = [];
  const where = [];
  let i = 1;
  if (filters.status) {
    params.push(String(filters.status).trim().toLowerCase());
    where.push(`status = $${i++}`);
  }
  if (filters.event_type) {
    params.push(String(filters.event_type).trim().toLowerCase());
    where.push(`event_type = $${i++}`);
  }
  if (filters.date_from) {
    params.push(String(filters.date_from));
    where.push(`created_at >= $${i++}::date`);
  }
  if (filters.date_to) {
    params.push(String(filters.date_to));
    where.push(`created_at < ($${i++}::date + INTERVAL '1 day')`);
  }
  if (filters.ready_for_retry === true || filters.ready_for_retry === '1' || filters.ready_for_retry === 'true') {
    params.push(MAX_AUTO_UPLOAD_ATTEMPTS);
    where.push(`status = 'failed'`);
    where.push(`retry_count < $${i++}`);
    where.push(`(next_retry_at IS NULL OR next_retry_at <= NOW())`);
  }
  if (filters.retry_scheduled === true || filters.retry_scheduled === '1' || filters.retry_scheduled === 'true') {
    where.push(`status = 'failed'`);
    where.push(`next_retry_at IS NOT NULL`);
    where.push(`next_retry_at > NOW()`);
  }

  const q = `SELECT * FROM google_offline_conversion_events ${
    where.length ? `WHERE ${where.join(' AND ')}` : ''
  } ORDER BY created_at DESC LIMIT ${limit}`;
  const r = await db.query(q, params);
  return r.rows;
}

async function summarizeGoogleOfflineConversionEvents(filters = {}, db = pool) {
  const params = [];
  const where = [];
  let i = 1;
  if (filters.date_from) {
    params.push(String(filters.date_from));
    where.push(`created_at >= $${i++}::date`);
  }
  if (filters.date_to) {
    params.push(String(filters.date_to));
    where.push(`created_at < ($${i++}::date + INTERVAL '1 day')`);
  }
  if (filters.event_type) {
    params.push(String(filters.event_type).trim().toLowerCase());
    where.push(`event_type = $${i++}`);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const retryIdx = params.length + 1;
  const retryWhere = w
    ? `${w} AND status = 'failed' AND retry_count < $${retryIdx}::int AND (next_retry_at IS NULL OR next_retry_at <= NOW())`
    : `WHERE status = 'failed' AND retry_count < $1::int AND (next_retry_at IS NULL OR next_retry_at <= NOW())`;
  const retryQueryParams = w.length ? [...params, MAX_AUTO_UPLOAD_ATTEMPTS] : [MAX_AUTO_UPLOAD_ATTEMPTS];

  const waitingWhere = w
    ? `${w} AND status = 'failed' AND next_retry_at IS NOT NULL AND next_retry_at > NOW()`
    : `WHERE status = 'failed' AND next_retry_at IS NOT NULL AND next_retry_at > NOW()`;
  const skippedWhere = w ? `${w} AND status = 'skipped'` : `WHERE status = 'skipped'`;
  const sentWhere = w ? `${w} AND status = 'sent' AND sent_at IS NOT NULL` : `WHERE status = 'sent' AND sent_at IS NOT NULL`;

  const [
    byStatus,
    byType,
    byEventTypeStatus,
    retryableRow,
    waitingRow,
    ratesByType,
    skippedBreakdown,
    sendLatencyByType,
    avgValueByType,
    valueSourceBreakdown,
    gclidQualityBreakdown,
  ] = await Promise.all([
    db.query(`SELECT status, COUNT(*)::bigint AS n FROM google_offline_conversion_events ${w} GROUP BY status`, params),
    db.query(`SELECT event_type, COUNT(*)::bigint AS n FROM google_offline_conversion_events ${w} GROUP BY event_type`, params),
    db.query(
      `SELECT event_type, status, COUNT(*)::bigint AS n
       FROM google_offline_conversion_events ${w}
       GROUP BY event_type, status
       ORDER BY event_type, status`,
      params
    ),
    db.query(
      `SELECT COUNT(*)::bigint AS n FROM google_offline_conversion_events ${retryWhere}`,
      retryQueryParams
    ),
    db.query(`SELECT COUNT(*)::bigint AS n FROM google_offline_conversion_events ${waitingWhere}`, params),
    db.query(
      `SELECT
         event_type,
         COUNT(*)::bigint AS total,
         COUNT(*) FILTER (WHERE status = 'sent')::bigint AS sent,
         COUNT(*) FILTER (WHERE status = 'skipped')::bigint AS skipped,
         COUNT(*) FILTER (WHERE status = 'failed')::bigint AS failed,
         COUNT(*) FILTER (WHERE status = 'pending')::bigint AS pending,
         COUNT(*) FILTER (WHERE status = 'processing')::bigint AS processing,
         CASE
           WHEN COUNT(*) > 0 THEN ROUND(
             (100.0 * COUNT(*) FILTER (WHERE status = 'sent') / COUNT(*))::numeric,
             2
           )
           ELSE 0::numeric
         END AS sent_rate_pct
       FROM google_offline_conversion_events ${w}
       GROUP BY event_type
       ORDER BY event_type`,
      params
    ),
    db.query(
      `SELECT event_type, skip_reason_bucket, COUNT(*)::bigint AS n
       FROM (
         SELECT
           event_type,
           CASE
             WHEN error_message IN ('missing_trusted_gclid', 'missing_gclid', 'missing_click_id') THEN 'missing_gclid'
             WHEN error_message = 'missing_conversion_action_resource_name' THEN 'missing_conversion_action'
             WHEN error_message IN ('opportunity_not_won', 'invoice_not_paid') THEN 'invalid_stage'
             ELSE 'other'
           END AS skip_reason_bucket
         FROM google_offline_conversion_events
         ${skippedWhere}
       ) t
       GROUP BY event_type, skip_reason_bucket
       ORDER BY event_type, skip_reason_bucket`,
      params
    ),
    db.query(
      `SELECT
         event_type,
         AVG(EXTRACT(EPOCH FROM (sent_at - created_at))) AS avg_seconds_to_send,
         COUNT(*)::bigint AS sent_samples
       FROM google_offline_conversion_events
       ${sentWhere}
       GROUP BY event_type
       ORDER BY event_type`,
      params
    ),
    db
      .query(
        `SELECT
           event_type,
           ROUND(AVG(conversion_value) FILTER (WHERE status = 'sent')::numeric, 4) AS avg_conversion_value_sent,
           ROUND(AVG(conversion_value)::numeric, 4) AS avg_conversion_value_all,
           COUNT(*)::bigint AS rows_total
         FROM google_offline_conversion_events ${w}
         GROUP BY event_type
         ORDER BY event_type`,
        params
      )
      .catch(() => ({ rows: [] })),
    db
      .query(
        `SELECT event_type, value_source, COUNT(*)::bigint AS n
         FROM google_offline_conversion_events ${w}
         GROUP BY event_type, value_source
         ORDER BY event_type, value_source NULLS LAST`,
        params
      )
      .catch(() => ({ rows: [] })),
    db
      .query(
        `SELECT event_type, gclid_quality, COUNT(*)::bigint AS n
         FROM google_offline_conversion_events ${w}
         GROUP BY event_type, gclid_quality
         ORDER BY event_type, gclid_quality NULLS LAST`,
        params
      )
      .catch(() => ({ rows: [] })),
  ]);

  let retryable_failed = Number(retryableRow.rows[0]?.n ?? 0);
  if (Number.isNaN(retryable_failed)) retryable_failed = 0;

  let waiting_retry = Number(waitingRow.rows[0]?.n ?? 0);
  if (Number.isNaN(waiting_retry)) waiting_retry = 0;

  const gclidCoverage = await db
    .query(
      `SELECT
         event_type,
         COUNT(*)::bigint AS rows_total,
         COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(gclid, '')), '') IS NOT NULL)::bigint AS rows_with_gclid,
         CASE
           WHEN COUNT(*) > 0 THEN ROUND(
             (100.0 * COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(gclid, '')), '') IS NOT NULL) / COUNT(*))::numeric,
             2
           )
           ELSE 0::numeric
         END AS pct_with_gclid
       FROM google_offline_conversion_events
       ${w}
       GROUP BY event_type`,
      params
    )
    .catch(() => ({ rows: [] }));

  return {
    by_status: byStatus.rows,
    by_event_type: byType.rows,
    by_event_type_and_status: byEventTypeStatus.rows,
    retryable_failed,
    waiting_retry,
    max_auto_upload_attempts: MAX_AUTO_UPLOAD_ATTEMPTS,
    backoff_minutes: backoffPreviewMinutes(),
    conversion_rates_by_event_type: ratesByType.rows,
    skipped_reason_breakdown: skippedBreakdown.rows,
    avg_seconds_to_send_by_event_type: sendLatencyByType.rows,
    gclid_nonempty_by_event_type: gclidCoverage.rows,
    avg_conversion_value_by_event_type: avgValueByType.rows,
    value_source_breakdown: valueSourceBreakdown.rows,
    gclid_quality_breakdown: gclidQualityBreakdown.rows,
  };
}

function isUuidString(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || '').trim());
}

/**
 * Single-opportunity debug timeline: CRM + queue rows for offline conversions.
 */
async function getGoogleOfflineConversionTimeline(opportunityId, db = pool) {
  const id = String(opportunityId || '').trim();
  if (!isUuidString(id)) {
    const e = new Error('Invalid opportunity_id');
    e.code = 'VALIDATION';
    throw e;
  }

  const auditPromise = db
    .query(
      `SELECT id, event_type, source, payload, action_type, old_value, new_value, trigger_event,
              COALESCE(executed_at, created_at) AS at
       FROM automation_audit_log
       WHERE entity_type = 'opportunity' AND entity_id = $1::uuid
       ORDER BY COALESCE(executed_at, created_at) ASC NULLS LAST, created_at ASC`,
      [id]
    )
    .catch(() =>
      db.query(
        `SELECT id, event_type, source, payload, action_type, old_value, new_value, trigger_event,
                created_at AS at
         FROM automation_audit_log
         WHERE entity_type = 'opportunity' AND entity_id = $1::uuid
         ORDER BY created_at ASC`,
        [id]
      )
    );

  const [
    oppRes,
    domainRes,
    auditRes,
    offlineByOpp,
    invoicesRes,
    offlineByInvoice,
  ] = await Promise.all([
    db.query(`SELECT * FROM opportunities WHERE id = $1::uuid LIMIT 1`, [id]),
    db.query(
      `SELECT id, event_type, payload, occurred_at, created_at
       FROM domain_events
       WHERE aggregate_type = 'opportunity' AND aggregate_id = $1::uuid
       ORDER BY occurred_at ASC NULLS LAST, created_at ASC`,
      [id]
    ),
    auditPromise,
    db.query(
      `SELECT * FROM google_offline_conversion_events
       WHERE opportunity_id = $1::uuid
       ORDER BY created_at ASC`,
      [id]
    ),
    db.query(
      `SELECT id, status, amount, paid_at, created_at, updated_at
       FROM invoices
       WHERE opportunity_id = $1::uuid
       ORDER BY created_at ASC`,
      [id]
    ),
    db.query(
      `SELECT g.* FROM google_offline_conversion_events g
       WHERE g.invoice_id IN (SELECT id FROM invoices WHERE opportunity_id = $1::uuid)
       ORDER BY g.created_at ASC`,
      [id]
    ),
  ]);

  const opportunity = oppRes.rows[0] || null;
  if (!opportunity) {
    return {
      opportunity: null,
      timeline: [],
      invoices: [],
      offline_conversion_events: [],
      raw: {
        opportunity: null,
        domain_events: [],
        automation_audit_log: [],
        invoices: [],
        offline_conversion_events: [],
      },
    };
  }

  const timeline = [];

  timeline.push({
    kind: 'opportunity_created',
    at: opportunity.created_at,
    detail: { stage: opportunity.stage, lead_id: opportunity.lead_id },
  });

  for (const ev of domainRes.rows) {
    timeline.push({
      kind: 'domain_event',
      at: ev.occurred_at || ev.created_at,
      detail: { event_type: ev.event_type, id: ev.id, payload: ev.payload },
    });
  }

  for (const row of auditRes.rows) {
    timeline.push({
      kind: 'automation_audit',
      at: row.at,
      detail: {
        event_type: row.event_type,
        action_type: row.action_type,
        old_value: row.old_value,
        new_value: row.new_value,
        trigger_event: row.trigger_event,
        source: row.source,
        id: row.id,
      },
    });
  }

  for (const inv of invoicesRes.rows) {
    timeline.push({
      kind: 'invoice_row',
      at: inv.created_at,
      detail: {
        invoice_id: inv.id,
        status: inv.status,
        amount: inv.amount,
        paid_at: inv.paid_at,
      },
    });
  }

  const offlineMerged = [...offlineByOpp.rows];
  const seen = new Set(offlineMerged.map((r) => r.id));
  for (const r of offlineByInvoice.rows) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      offlineMerged.push(r);
    }
  }
  offlineMerged.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  for (const g of offlineMerged) {
    timeline.push({
      kind: 'offline_conversion_event',
      at: g.created_at,
      detail: {
        id: g.id,
        event_type: g.event_type,
        queue_status: g.status,
        sent_at: g.sent_at,
        last_attempt_at: g.last_attempt_at,
        retry_count: g.retry_count,
        next_retry_at: g.next_retry_at,
        last_retry_at: g.last_retry_at,
        error_message: g.error_message,
        invoice_id: g.invoice_id,
        dedupe_key: g.dedupe_key,
        has_gclid: Boolean(g.gclid && String(g.gclid).trim()),
        gclid_quality: g.gclid_quality ?? null,
        value_source: g.value_source ?? null,
      },
    });
  }

  timeline.sort((a, b) => {
    const ta = a.at ? new Date(a.at).getTime() : 0;
    const tb = b.at ? new Date(b.at).getTime() : 0;
    return ta - tb;
  });

  const raw = {
    opportunity: opportunity,
    domain_events: domainRes.rows,
    automation_audit_log: auditRes.rows,
    invoices: invoicesRes.rows,
    offline_conversion_events: offlineMerged,
  };

  return {
    opportunity: {
      id: opportunity.id,
      stage: opportunity.stage,
      status: opportunity.status,
      lead_id: opportunity.lead_id,
      won_at: opportunity.won_at ?? null,
      created_at: opportunity.created_at,
      updated_at: opportunity.updated_at,
    },
    invoices: invoicesRes.rows,
    offline_conversion_events: offlineMerged,
    timeline,
    raw,
  };
}

async function listOfflineUploadRuns(filters = {}, db = pool) {
  const limit = Math.min(Math.max(parseInt(String(filters.limit || '30'), 10) || 30, 1), 200);
  try {
    const r = await db.query(
      `SELECT id, sync_type, mode, dry_run, started_at, finished_at, status,
              fetched_count, mapped_count, created_count, updated_count, skipped_count,
              summary, error_message
       FROM sync_runs
       WHERE sync_type = $1
       ORDER BY started_at DESC
       LIMIT $2`,
      [SYNC_TYPE_OFFLINE_UPLOAD, limit]
    );
    return r.rows;
  } catch (e) {
    if (/sync_runs|does not exist/i.test(e.message || '')) {
      return [];
    }
    throw e;
  }
}

module.exports = {
  enqueueInvoicePaidConversionEvent,
  enqueueOpportunityWonConversionEvent,
  scheduleOpportunityWonOfflineConversion,
  uploadPendingGoogleOfflineConversions,
  listGoogleOfflineConversionEvents,
  summarizeGoogleOfflineConversionEvents,
  getGoogleOfflineConversionTimeline,
  listOfflineUploadRuns,
  isLikelyGclid,
  getConversionActionConfig,
  MAX_AUTO_UPLOAD_ATTEMPTS,
  SYNC_TYPE_OFFLINE_UPLOAD,
};
