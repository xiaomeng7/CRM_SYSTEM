/**
 * Google Ads Targeting Publisher v1 — campaign-level negative keywords only (REST + OAuth).
 * Reuses googleAdsSync auth; resolveGoogleCampaignId from googleAdsBudgetPublisher.
 */

const { assertGoogleAdsEnv, getAdsAccessToken, apiVersion } = require('./googleAdsSync');
const { resolveGoogleCampaignId, buildAdsHeaders } = require('./googleAdsBudgetPublisher');

function isDryRun() {
  const v = process.env.GOOGLE_ADS_PUBLISH_DRY_RUN;
  return v === '1' || String(v || '').toLowerCase() === 'true';
}

/**
 * @param {unknown} list
 * @returns {string[]|null} null if input invalid or normalized list empty
 */
function normalizeNegativeKeywords(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const out = [];
  const seen = new Set();
  for (const x of list) {
    const s = String(x == null ? '' : x)
      .trim()
      .toLowerCase();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out.length ? out : null;
}

function taskForCampaignResolve(task) {
  const p = { ...(task.payload || {}) };
  if (!p.utm_campaign && task.utm_campaign != null && String(task.utm_campaign).trim()) {
    p.utm_campaign = String(task.utm_campaign).trim();
  }
  return { ...task, payload: p };
}

async function googleAdsSearchAll(query) {
  assertGoogleAdsEnv();
  const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
  const ver = apiVersion();
  const accessToken = await getAdsAccessToken();
  const headers = buildAdsHeaders(accessToken);
  const url = `https://googleads.googleapis.com/${ver}/customers/${customerId}/googleAds:search`;

  const rows = [];
  let pageToken = null;
  do {
    const body = { query, pageSize: 10000 };
    if (pageToken) body.pageToken = pageToken;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (_) {
      json = null;
    }
    if (!res.ok) {
      const msg = json && json.error ? JSON.stringify(json.error) : text.slice(0, 800);
      const err = new Error(`Google Ads search HTTP ${res.status}: ${msg}`);
      err.code = 'existing_negative_keywords_query_failed';
      throw err;
    }
    const batch = json && Array.isArray(json.results) ? json.results : [];
    rows.push(...batch);
    pageToken = json && json.nextPageToken ? json.nextPageToken : null;
  } while (pageToken);

  return rows;
}

/**
 * @param {{ googleCampaignId: string }} opts
 * @returns {Promise<string[]>} normalized lowercase unique texts
 */
async function fetchExistingNegativeKeywords(opts) {
  const googleCampaignId = String(opts.googleCampaignId || '').trim();
  if (!/^\d+$/.test(googleCampaignId)) {
    const err = new Error('invalid_google_campaign_id');
    err.code = 'existing_negative_keywords_query_failed';
    throw err;
  }

  const query = `
    SELECT
      campaign_criterion.resource_name,
      campaign_criterion.type,
      campaign_criterion.negative,
      campaign_criterion.keyword.text,
      campaign_criterion.keyword.match_type
    FROM campaign_criterion
    WHERE campaign.id = ${googleCampaignId}
      AND campaign_criterion.type = KEYWORD
      AND campaign_criterion.negative = TRUE
  `.trim();

  let rows;
  try {
    rows = await googleAdsSearchAll(query);
  } catch (e) {
    if (e.code === 'existing_negative_keywords_query_failed') throw e;
    const err = new Error(e.message || String(e));
    err.code = 'existing_negative_keywords_query_failed';
    throw err;
  }

  const seen = new Set();
  for (const row of rows) {
    const cc = row.campaignCriterion || row.campaign_criterion;
    if (!cc || cc.negative !== true) continue;
    const t = cc.keyword?.text ?? cc.keyword?.Text;
    if (t != null && String(t).trim()) {
      seen.add(String(t).trim().toLowerCase());
    }
  }
  return [...seen].sort();
}

/**
 * @param {{ googleCampaignId: string, keywords: string[] }} opts
 */
const MUTATE_CHUNK_SIZE = 100;

async function mutateCampaignNegativeKeywordBatch(customerId, ver, headers, campaignResource, keywordSlice) {
  const mutateOperations = keywordSlice.map((text) => ({
    campaignCriterionOperation: {
      create: {
        campaign: campaignResource,
        type: 'KEYWORD',
        negative: true,
        keyword: {
          text,
          matchType: 'BROAD',
        },
      },
    },
  }));

  const url = `https://googleads.googleapis.com/${ver}/customers/${customerId}/googleAds:mutate`;
  const body = {
    mutateOperations,
    partialFailure: false,
    validateOnly: false,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }
  if (!res.ok) {
    const msg = json && json.error ? JSON.stringify(json.error) : text.slice(0, 2000);
    throw new Error(msg);
  }
  if (json && json.partialFailureError) {
    throw new Error(JSON.stringify(json.partialFailureError));
  }
  return json || {};
}

/**
 * @param {{ googleCampaignId: string, keywords: string[] }} opts
 */
async function addCampaignNegativeKeywords(opts) {
  const googleCampaignId = String(opts.googleCampaignId || '').trim();
  const keywords = Array.isArray(opts.keywords) ? opts.keywords : [];
  if (!/^\d+$/.test(googleCampaignId) || !keywords.length) {
    throw new Error('invalid_add_negative_keywords_input');
  }

  assertGoogleAdsEnv();
  const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
  const ver = apiVersion();
  const accessToken = await getAdsAccessToken();
  const headers = buildAdsHeaders(accessToken);
  const campaignResource = `customers/${customerId}/campaigns/${googleCampaignId}`;

  for (let i = 0; i < keywords.length; i += MUTATE_CHUNK_SIZE) {
    const slice = keywords.slice(i, i + MUTATE_CHUNK_SIZE);
    await mutateCampaignNegativeKeywordBatch(customerId, ver, headers, campaignResource, slice);
  }
  return { ok: true, batches: Math.ceil(keywords.length / MUTATE_CHUNK_SIZE) };
}

const SYNC_TYPE_TARGETING_LOG = 'growth_targeting_publisher';

/**
 * @param {import('pg').Pool|null} db
 * @param {object|null} task
 * @param {object} result
 * @param {object} [ctx]
 */
async function persistTargetingPublisherExecutionLog(db, task, result, ctx = {}) {
  if (!db || typeof db.query !== 'function') return;

  const t = task && typeof task === 'object' ? task : {};
  const resPart = result && result.result && typeof result.result === 'object' ? result.result : {};
  const success = Boolean(result && result.ok === true);
  const execution_mode = (result && result.execution_mode) || 'error';
  const dry_run = execution_mode === 'dry_run';
  const errText = success
    ? null
    : [result && result.error, result && result.details].filter(Boolean).join(' | ') || 'unknown';

  const summary = {
    task_type: 'adjust_targeting',
    campaign_id: t.campaign_id != null ? String(t.campaign_id) : null,
    google_campaign_id: ctx.google_campaign_id ?? resPart.google_campaign_id ?? null,
    requested_negative_keywords: resPart.requested_negative_keywords ?? ctx.requested ?? null,
    existing_negative_keywords: resPart.existing_negative_keywords ?? ctx.existing ?? null,
    added_negative_keywords: resPart.added_negative_keywords ?? ctx.added ?? null,
    execution_mode,
    success,
    error_code: success ? null : result.error || null,
    timestamp: new Date().toISOString(),
  };

  try {
    await db.query(
      `INSERT INTO sync_runs (
        sync_type, mode, dry_run, status, finished_at,
        source, run_type, summary, error_message, created_by,
        fetched_count, mapped_count, created_count, updated_count, skipped_count
      ) VALUES (
        $1, 'negative_keywords', $2, $3, NOW(),
        'google_ads', 'targeting_adjustment', $4::jsonb, $5, $6,
        0, 0, 0, 0, 0
      )`,
      [
        SYNC_TYPE_TARGETING_LOG,
        dry_run,
        success ? 'completed' : 'failed',
        JSON.stringify(summary),
        errText ? String(errText).slice(0, 5000) : null,
        'google-ads-targeting-publisher',
      ]
    );
  } catch (e) {
    try {
      await db.query(
        `INSERT INTO sync_runs (sync_type, mode, dry_run, status, finished_at, details)
         VALUES ($1, 'negative_keywords', $2, $3, NOW(), $4::jsonb)`,
        [SYNC_TYPE_TARGETING_LOG, dry_run, success ? 'completed' : 'failed', JSON.stringify(summary)]
      );
    } catch (e2) {
      console.warn('[targeting-publisher] execution log insert failed:', e.message, '|', e2.message);
    }
  }
}

async function logAndReturn(db, task, result, ctx) {
  await persistTargetingPublisherExecutionLog(db, task, result, ctx);
  return result;
}

/**
 * @param {{ task: object, db: import('pg').Pool }} opts
 */
async function publishTargetingAdjustment(opts) {
  const task = opts && opts.task ? opts.task : null;
  const db = opts && opts.db ? opts.db : null;

  if (!task || String(task.task_type || '').trim() !== 'adjust_targeting') {
    return logAndReturn(db, task, {
      ok: false,
      task_type: 'adjust_targeting',
      execution_mode: 'error',
      error: 'invalid_task',
    });
  }

  const payload = task.payload || {};
  const rawList = payload.negative_keywords;
  if (!Array.isArray(rawList) || rawList.length === 0) {
    return logAndReturn(db, task, {
      ok: false,
      task_type: 'adjust_targeting',
      execution_mode: 'error',
      error: 'invalid_negative_keywords',
    });
  }

  const requested = normalizeNegativeKeywords(rawList);
  if (!requested || requested.length === 0) {
    return logAndReturn(db, task, {
      ok: false,
      task_type: 'adjust_targeting',
      execution_mode: 'error',
      error: 'invalid_negative_keywords',
    });
  }

  const localCampaignId = task.campaign_id || null;
  console.log(`[targeting-publisher] start campaign_id=${localCampaignId || '(none)'}`);

  let googleCampaignId = null;
  try {
    if (!db || typeof db.query !== 'function') {
      return logAndReturn(db, task, {
        ok: false,
        task_type: 'adjust_targeting',
        execution_mode: 'error',
        error: 'google_campaign_id_not_found',
      });
    }
    googleCampaignId = await resolveGoogleCampaignId(db, taskForCampaignResolve(task));
  } catch (e) {
    console.warn('[targeting-publisher] failed:', e.message || e);
    return logAndReturn(
      db,
      task,
      {
        ok: false,
        task_type: 'adjust_targeting',
        execution_mode: 'error',
        error: 'google_campaign_id_not_found',
        details: e.message,
      },
      { requested }
    );
  }

  if (!googleCampaignId) {
    console.warn('[targeting-publisher] failed: google_campaign_id_not_found');
    return logAndReturn(db, task, {
      ok: false,
      task_type: 'adjust_targeting',
      execution_mode: 'error',
      error: 'google_campaign_id_not_found',
    });
  }

  console.log(`[targeting-publisher] resolved google_campaign_id=${googleCampaignId}`);

  try {
    assertGoogleAdsEnv();
  } catch (e) {
    console.warn('[targeting-publisher] failed:', e.message || e);
    return logAndReturn(
      db,
      task,
      {
        ok: false,
        task_type: 'adjust_targeting',
        execution_mode: 'error',
        error: 'missing_google_ads_env',
        details: e.message,
      },
      { google_campaign_id: googleCampaignId, requested }
    );
  }

  let existing = [];
  try {
    existing = await fetchExistingNegativeKeywords({ googleCampaignId });
  } catch (e) {
    console.warn('[targeting-publisher] failed:', e.message || e);
    return logAndReturn(
      db,
      task,
      {
        ok: false,
        task_type: 'adjust_targeting',
        execution_mode: 'error',
        error: 'existing_negative_keywords_query_failed',
        details: e.message,
      },
      { google_campaign_id: googleCampaignId, requested }
    );
  }

  const existingSet = new Set(existing);
  const added = requested.filter((k) => !existingSet.has(k));

  console.log(`[targeting-publisher] existing=${JSON.stringify(existing)}`);
  console.log(`[targeting-publisher] requested=${JSON.stringify(requested)}`);
  console.log(`[targeting-publisher] added=${JSON.stringify(added)}`);
  console.log(`[targeting-publisher] dry_run=${isDryRun()}`);

  const baseResult = {
    google_campaign_id: googleCampaignId,
    requested_negative_keywords: requested,
    existing_negative_keywords: existing,
    added_negative_keywords: added,
  };

  if (added.length === 0) {
    console.log('[targeting-publisher] success (noop)');
    return logAndReturn(
      db,
      task,
      {
        ok: true,
        task_type: 'adjust_targeting',
        execution_mode: 'noop',
        result: { ...baseResult, added_negative_keywords: [] },
      },
      {
        google_campaign_id: googleCampaignId,
        requested,
        existing,
        added: [],
      }
    );
  }

  if (isDryRun()) {
    console.log('[targeting-publisher] success (dry_run)');
    return logAndReturn(
      db,
      task,
      {
        ok: true,
        task_type: 'adjust_targeting',
        execution_mode: 'dry_run',
        result: baseResult,
      },
      {
        google_campaign_id: googleCampaignId,
        requested,
        existing,
        added,
      }
    );
  }

  try {
    await addCampaignNegativeKeywords({ googleCampaignId, keywords: added });
    console.log('[targeting-publisher] success');
    return logAndReturn(
      db,
      task,
      {
        ok: true,
        task_type: 'adjust_targeting',
        execution_mode: 'executed',
        result: baseResult,
      },
      {
        google_campaign_id: googleCampaignId,
        requested,
        existing,
        added,
      }
    );
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    console.warn('[targeting-publisher] failed:', msg);
    return logAndReturn(
      db,
      task,
      {
        ok: false,
        task_type: 'adjust_targeting',
        execution_mode: 'error',
        error: 'targeting_update_failed',
        details: msg.slice(0, 2000),
      },
      {
        google_campaign_id: googleCampaignId,
        requested,
        existing,
        added,
      }
    );
  }
}

function getMockTargetingAdjustmentResult() {
  return {
    ok: true,
    task_type: 'adjust_targeting',
    execution_mode: 'dry_run',
    result: {
      google_campaign_id: '12345678901',
      requested_negative_keywords: ['cheap', 'repair', 'small job'],
      existing_negative_keywords: ['cheap'],
      added_negative_keywords: ['repair', 'small job'],
    },
  };
}

module.exports = {
  publishTargetingAdjustment,
  normalizeNegativeKeywords,
  fetchExistingNegativeKeywords,
  addCampaignNegativeKeywords,
  persistTargetingPublisherExecutionLog,
  getMockTargetingAdjustmentResult,
};
