/**
 * Google Ads Budget Publisher v1 — apply growthTaskExecutor budget_adjustment tasks via REST.
 * Reuses OAuth from googleAdsSync. Supports GOOGLE_ADS_PUBLISH_DRY_RUN.
 */

const {
  assertGoogleAdsEnv,
  getAdsAccessToken,
  apiVersion,
} = require('./googleAdsSync');

function isDryRun() {
  const v = process.env.GOOGLE_ADS_PUBLISH_DRY_RUN;
  return v === '1' || String(v || '').toLowerCase() === 'true';
}

/**
 * @param {string} change e.g. +20%, -10%, 20%
 * @returns {{ direction: 'increase'|'decrease', percent: number }}
 */
function parseBudgetChange(change) {
  const s = String(change ?? '')
    .trim()
    .replace(/\s+/g, '');
  const m = s.match(/^([+-]?)(\d+(?:\.\d+)?)%?$/);
  if (!m) {
    const err = new Error('invalid_budget_change');
    err.code = 'invalid_budget_change';
    throw err;
  }
  const sign = m[1];
  const p = parseFloat(m[2]);
  if (!Number.isFinite(p) || p <= 0 || p > 30) {
    const err = new Error('invalid_budget_change');
    err.code = 'invalid_budget_change';
    throw err;
  }
  const direction = sign === '-' ? 'decrease' : 'increase';
  return { direction, percent: p };
}

function buildAdsHeaders(accessToken) {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const loginCid = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '').replace(/-/g, '');
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json',
  };
  if (loginCid && /^\d{10}$/.test(loginCid)) {
    headers['login-customer-id'] = loginCid;
  }
  return headers;
}

/**
 * @param {import('pg').Pool} db
 * @param {object} task
 * @returns {Promise<string|null>}
 */
async function resolveGoogleCampaignId(db, task) {
  const payload = task.payload || {};
  const utm =
    payload.utm_campaign != null && String(payload.utm_campaign).trim()
      ? String(payload.utm_campaign).trim()
      : null;

  if (task.campaign_id) {
    const r = await db.query(
      `SELECT google_campaign_id, code, name FROM campaigns WHERE id = $1::uuid LIMIT 1`,
      [task.campaign_id]
    );
    const row = r.rows[0];
    if (row && row.google_campaign_id != null && String(row.google_campaign_id).trim()) {
      return String(row.google_campaign_id).trim();
    }
  }

  if (utm) {
    const r2 = await db.query(
      `SELECT google_campaign_id
       FROM campaigns
       WHERE google_campaign_id IS NOT NULL
         AND TRIM(google_campaign_id) <> ''
         AND (
           LOWER(TRIM(COALESCE(code, ''))) = LOWER(TRIM($1))
           OR LOWER(TRIM(COALESCE(name, ''))) = LOWER(TRIM($1))
         )`,
      [utm]
    );
    const ids = [
      ...new Set(
        (r2.rows || [])
          .map((x) => (x.google_campaign_id != null ? String(x.google_campaign_id).trim() : ''))
          .filter(Boolean)
      ),
    ];
    if (ids.length === 1) return ids[0];
    return null;
  }

  return null;
}

/**
 * @param {{ googleCampaignId: string }} opts
 * @returns {Promise<{ campaignBudgetResourceName: string, amountMicros: number }>}
 */
async function fetchCurrentCampaignBudgetMicros(opts) {
  const googleCampaignId = String(opts.googleCampaignId || '').trim();
  if (!/^\d+$/.test(googleCampaignId)) {
    throw new Error('invalid_google_campaign_id');
  }

  assertGoogleAdsEnv();
  const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
  const ver = apiVersion();
  const accessToken = await getAdsAccessToken();
  const headers = buildAdsHeaders(accessToken);

  const query = `
    SELECT
      campaign.id,
      campaign.campaign_budget,
      campaign_budget.amount_micros
    FROM campaign
    WHERE campaign.id = ${googleCampaignId}
  `.trim();

  const url = `https://googleads.googleapis.com/${ver}/customers/${customerId}/googleAds:search`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, pageSize: 10 }),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }
  if (!res.ok) {
    throw new Error(`Google Ads search HTTP ${res.status}: ${(text || '').slice(0, 600)}`);
  }

  const results = json && Array.isArray(json.results) ? json.results : [];
  if (!results.length) {
    const err = new Error('current_budget_not_found');
    err.code = 'current_budget_not_found';
    throw err;
  }

  const row = results[0];
  const budgetName =
    row.campaign?.campaignBudget ||
    row.campaign?.campaign_budget ||
    row.campaignBudget?.resourceName ||
    row.campaignBudget?.resource_name;
  const microsRaw =
    row.campaignBudget?.amountMicros ??
    row.campaignBudget?.amount_micros ??
    row.campaign_budget?.amountMicros ??
    row.campaign_budget?.amount_micros;

  if (!budgetName || microsRaw == null) {
    const err = new Error('current_budget_not_found');
    err.code = 'current_budget_not_found';
    throw err;
  }

  const amountMicros = Math.round(Number(microsRaw));
  if (!Number.isFinite(amountMicros) || amountMicros <= 0) {
    const err = new Error('current_budget_not_found');
    err.code = 'current_budget_not_found';
    throw err;
  }

  return { campaignBudgetResourceName: String(budgetName).trim(), amountMicros };
}

/**
 * @param {{ campaignBudgetResourceName: string, newBudgetMicros: number }} opts
 */
async function updateCampaignBudgetMicros(opts) {
  const { campaignBudgetResourceName, newBudgetMicros } = opts;
  const n = Math.ceil(Number(newBudgetMicros));
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('invalid_new_budget_micros');
  }

  assertGoogleAdsEnv();
  const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
  const ver = apiVersion();
  const accessToken = await getAdsAccessToken();
  const headers = buildAdsHeaders(accessToken);

  const url = `https://googleads.googleapis.com/${ver}/customers/${customerId}/googleAds:mutate`;
  const body = {
    mutateOperations: [
      {
        campaignBudgetOperation: {
          update: {
            resourceName: campaignBudgetResourceName,
            amountMicros: String(n),
          },
          updateMask: 'amountMicros',
        },
      },
    ],
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
    const msg = json && json.error ? JSON.stringify(json.error) : text.slice(0, 1200);
    throw new Error(msg);
  }
  if (json && json.partialFailureError) {
    throw new Error(JSON.stringify(json.partialFailureError));
  }
  return json || {};
}

const SYNC_TYPE_BUDGET_LOG = 'growth_budget_publisher';

/**
 * Light execution audit: one row per budget publisher attempt in sync_runs (039+).
 * Fallback: legacy sync_runs without extended columns uses details JSONB only.
 *
 * @param {import('pg').Pool|null} db
 * @param {object|null} task
 * @param {object} result — publishBudgetAdjustment return shape
 * @param {{ google_campaign_id?: string|null, current_budget_micros?: number|null, new_budget_micros?: number|null }} [ctx]
 */
async function persistBudgetPublisherExecutionLog(db, task, result, ctx = {}) {
  if (!db || typeof db.query !== 'function') return;

  const t = task && typeof task === 'object' ? task : {};
  const resPart = result && result.result && typeof result.result === 'object' ? result.result : {};
  const google_campaign_id =
    ctx.google_campaign_id !== undefined ? ctx.google_campaign_id : resPart.google_campaign_id ?? null;
  const current_budget_micros =
    ctx.current_budget_micros !== undefined ? ctx.current_budget_micros : resPart.current_budget_micros ?? null;
  const new_budget_micros =
    ctx.new_budget_micros !== undefined ? ctx.new_budget_micros : resPart.new_budget_micros ?? null;

  const success = Boolean(result && result.ok === true);
  const execution_mode = (result && result.execution_mode) || 'error';
  const dry_run = execution_mode === 'dry_run';
  const errText = success
    ? null
    : [result && result.error, result && result.details].filter(Boolean).join(' | ') || 'unknown';

  const summary = {
    task_type: 'budget_adjustment',
    campaign_id: t.campaign_id != null ? String(t.campaign_id) : null,
    google_campaign_id: google_campaign_id != null ? String(google_campaign_id) : null,
    current_budget_micros,
    new_budget_micros,
    execution_mode,
    success,
    error_code: success ? null : result.error || null,
    timestamp: new Date().toISOString(),
    payload_change: t.payload && t.payload.change != null ? String(t.payload.change) : null,
    percent_change: resPart.percent_change != null ? resPart.percent_change : null,
  };

  try {
    await db.query(
      `INSERT INTO sync_runs (
        sync_type, mode, dry_run, status, finished_at,
        source, run_type, summary, error_message, created_by,
        fetched_count, mapped_count, created_count, updated_count, skipped_count
      ) VALUES (
        $1, 'budget_adjustment', $2, $3, NOW(),
        'google_ads', 'budget_adjustment', $4::jsonb, $5, $6,
        0, 0, 0, 0, 0
      )`,
      [
        SYNC_TYPE_BUDGET_LOG,
        dry_run,
        success ? 'completed' : 'failed',
        JSON.stringify(summary),
        errText ? String(errText).slice(0, 5000) : null,
        'google-ads-budget-publisher',
      ]
    );
  } catch (e) {
    try {
      await db.query(
        `INSERT INTO sync_runs (sync_type, mode, dry_run, status, finished_at, details)
         VALUES ($1, 'budget_adjustment', $2, $3, NOW(), $4::jsonb)`,
        [SYNC_TYPE_BUDGET_LOG, dry_run, success ? 'completed' : 'failed', JSON.stringify(summary)]
      );
    } catch (e2) {
      console.warn('[budget-publisher] execution log insert failed:', e.message, '|', e2.message);
    }
  }
}

async function logAndReturn(db, task, result, ctx) {
  await persistBudgetPublisherExecutionLog(db, task, result, ctx);
  return result;
}

/**
 * @param {{ task: object, db: import('pg').Pool }} opts
 */
async function publishBudgetAdjustment(opts) {
  const task = opts && opts.task ? opts.task : null;
  const db = opts && opts.db ? opts.db : null;

  let googleCampaignId = null;
  let currentBudgetMicros = null;
  let newBudgetMicros = null;

  if (!task || String(task.task_type || '').trim() !== 'budget_adjustment') {
    return logAndReturn(db, task, {
      ok: false,
      task_type: 'budget_adjustment',
      execution_mode: 'error',
      error: 'invalid_task',
    });
  }

  const payload = task.payload || {};
  const change = payload.change;
  if (change == null || String(change).trim() === '') {
    return logAndReturn(db, task, {
      ok: false,
      task_type: 'budget_adjustment',
      execution_mode: 'error',
      error: 'invalid_budget_change',
    });
  }

  let parsed;
  try {
    parsed = parseBudgetChange(change);
  } catch (e) {
    return logAndReturn(db, task, {
      ok: false,
      task_type: 'budget_adjustment',
      execution_mode: 'error',
      error: 'invalid_budget_change',
    });
  }

  const localCampaignId = task.campaign_id || null;
  console.log(`[budget-publisher] start campaign_id=${localCampaignId || '(none)'}`);

  try {
    if (!db || typeof db.query !== 'function') {
      return logAndReturn(db, task, {
        ok: false,
        task_type: 'budget_adjustment',
        execution_mode: 'error',
        error: 'google_campaign_id_not_found',
      });
    }
    googleCampaignId = await resolveGoogleCampaignId(db, task);
  } catch (e) {
    console.warn('[budget-publisher] failed:', e.message || e);
    return logAndReturn(
      db,
      task,
      {
        ok: false,
        task_type: 'budget_adjustment',
        execution_mode: 'error',
        error: 'google_campaign_id_not_found',
        details: e.message,
      },
      { google_campaign_id: null }
    );
  }

  if (!googleCampaignId) {
    console.warn('[budget-publisher] failed: google_campaign_id_not_found');
    return logAndReturn(db, task, {
      ok: false,
      task_type: 'budget_adjustment',
      execution_mode: 'error',
      error: 'google_campaign_id_not_found',
    });
  }

  console.log(`[budget-publisher] resolved google_campaign_id=${googleCampaignId}`);

  try {
    assertGoogleAdsEnv();
  } catch (e) {
    console.warn('[budget-publisher] failed:', e.message || e);
    return logAndReturn(
      db,
      task,
      {
        ok: false,
        task_type: 'budget_adjustment',
        execution_mode: 'error',
        error: 'missing_google_ads_env',
        details: e.message,
      },
      { google_campaign_id: googleCampaignId }
    );
  }

  let campaignBudgetResourceName;
  try {
    const row = await fetchCurrentCampaignBudgetMicros({ googleCampaignId });
    campaignBudgetResourceName = row.campaignBudgetResourceName;
    currentBudgetMicros = row.amountMicros;
  } catch (e) {
    const code = e.code || e.message;
    if (e.message === 'current_budget_not_found' || code === 'current_budget_not_found') {
      console.warn('[budget-publisher] failed: current_budget_not_found');
      return logAndReturn(
        db,
        task,
        {
          ok: false,
          task_type: 'budget_adjustment',
          execution_mode: 'error',
          error: 'current_budget_not_found',
        },
        { google_campaign_id: googleCampaignId }
      );
    }
    console.warn('[budget-publisher] failed:', e.message || e);
    return logAndReturn(
      db,
      task,
      {
        ok: false,
        task_type: 'budget_adjustment',
        execution_mode: 'error',
        error: 'current_budget_not_found',
        details: e.message,
      },
      { google_campaign_id: googleCampaignId }
    );
  }

  const factor = parsed.direction === 'increase' ? 1 + parsed.percent / 100 : 1 - parsed.percent / 100;
  if (factor <= 0) {
    return logAndReturn(
      db,
      task,
      {
        ok: false,
        task_type: 'budget_adjustment',
        execution_mode: 'error',
        error: 'invalid_budget_change',
      },
      { google_campaign_id: googleCampaignId, current_budget_micros: currentBudgetMicros }
    );
  }

  const newBudgetMicrosFloat = currentBudgetMicros * factor;
  newBudgetMicros = Math.ceil(newBudgetMicrosFloat);
  if (!Number.isFinite(newBudgetMicros) || newBudgetMicros <= 0) {
    return logAndReturn(
      db,
      task,
      {
        ok: false,
        task_type: 'budget_adjustment',
        execution_mode: 'error',
        error: 'invalid_budget_change',
      },
      { google_campaign_id: googleCampaignId, current_budget_micros: currentBudgetMicros }
    );
  }

  const percentChange =
    parsed.direction === 'increase' ? parsed.percent : -parsed.percent;

  console.log(`[budget-publisher] current=${currentBudgetMicros} micros`);
  console.log(`[budget-publisher] new=${newBudgetMicros} micros`);
  console.log(`[budget-publisher] dry_run=${isDryRun()}`);

  const resultPayload = {
    google_campaign_id: googleCampaignId,
    current_budget_micros: currentBudgetMicros,
    new_budget_micros: newBudgetMicros,
    percent_change: percentChange,
    campaign_budget_resource_name: campaignBudgetResourceName,
  };

  if (isDryRun()) {
    console.log('[budget-publisher] success (dry_run)');
    return logAndReturn(
      db,
      task,
      {
        ok: true,
        task_type: 'budget_adjustment',
        execution_mode: 'dry_run',
        result: resultPayload,
      },
      {
        google_campaign_id: googleCampaignId,
        current_budget_micros: currentBudgetMicros,
        new_budget_micros: newBudgetMicros,
      }
    );
  }

  try {
    await updateCampaignBudgetMicros({
      campaignBudgetResourceName,
      newBudgetMicros,
    });
    console.log('[budget-publisher] success');
    return logAndReturn(
      db,
      task,
      {
        ok: true,
        task_type: 'budget_adjustment',
        execution_mode: 'executed',
        result: resultPayload,
      },
      {
        google_campaign_id: googleCampaignId,
        current_budget_micros: currentBudgetMicros,
        new_budget_micros: newBudgetMicros,
      }
    );
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    console.warn('[budget-publisher] failed:', msg);
    return logAndReturn(
      db,
      task,
      {
        ok: false,
        task_type: 'budget_adjustment',
        execution_mode: 'error',
        error: 'budget_update_failed',
        details: msg.slice(0, 2000),
      },
      {
        google_campaign_id: googleCampaignId,
        current_budget_micros: currentBudgetMicros,
        new_budget_micros: newBudgetMicros,
      }
    );
  }
}

/** Mock result shape for docs (no API). */
function getMockBudgetAdjustmentResult() {
  return {
    ok: true,
    task_type: 'budget_adjustment',
    execution_mode: 'dry_run',
    result: {
      google_campaign_id: '12345678901',
      current_budget_micros: 10000000,
      new_budget_micros: 12000000,
      percent_change: 20,
      campaign_budget_resource_name: 'customers/1234567890/campaignBudgets/9876543210',
    },
  };
}

module.exports = {
  publishBudgetAdjustment,
  parseBudgetChange,
  fetchCurrentCampaignBudgetMicros,
  updateCampaignBudgetMicros,
  resolveGoogleCampaignId,
  buildAdsHeaders,
  persistBudgetPublisherExecutionLog,
  getMockBudgetAdjustmentResult,
};
