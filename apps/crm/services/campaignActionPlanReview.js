/**
 * Campaign action plan review — persist approved/rejected decisions (no OpenClaw / no ads APIs).
 */

const { pool } = require('../lib/db');
const { campaignKey } = require('./campaignActionPlanEngine');

const ALLOWED_ACTIONS = new Set([
  'increase_budget',
  'decrease_budget',
  'pause_campaign',
  'improve_landing_page',
  'improve_ad_copy',
  'investigate_quality',
]);

const REVIEW_STATUSES = new Set(['approved', 'rejected']);

function isUuid(s) {
  return (
    typeof s === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim())
  );
}

/**
 * Resolve display `campaign` or optional `campaign_key` to canonical campaign_key used by ROI view.
 */
async function resolveCampaignKeyFromView({ campaign, campaign_key: keyOpt }) {
  const trimmed = typeof campaign === 'string' ? campaign.trim() : '';
  const keyTrim = typeof keyOpt === 'string' ? keyOpt.trim() : '';

  if (keyTrim) {
    let r;
    if (keyTrim.startsWith('id:')) {
      const id = keyTrim.slice(3);
      r = await pool.query(
        `SELECT * FROM v_campaign_roi_summary WHERE campaign_id = $1::uuid LIMIT 1`,
        [id]
      );
    } else if (keyTrim.startsWith('utm:')) {
      const u = keyTrim.slice(4);
      r = await pool.query(
        `SELECT * FROM v_campaign_roi_summary WHERE utm_campaign = $1 LIMIT 1`,
        [u]
      );
    } else {
      const err = new Error('campaign_key must be id:<uuid> or utm:<label>');
      err.code = 'BAD_CAMPAIGN_KEY';
      throw err;
    }
    if (!r.rows[0]) {
      const err = new Error('campaign_key does not match any ROI summary bucket');
      err.code = 'BAD_CAMPAIGN_KEY';
      throw err;
    }
    return { key: keyTrim, row: r.rows[0] };
  }

  if (!trimmed) {
    const err = new Error('campaign or campaign_key is required');
    err.code = 'VALIDATION';
    throw err;
  }

  if (isUuid(trimmed)) {
    const r = await pool.query(
      `SELECT * FROM v_campaign_roi_summary WHERE campaign_id = $1::uuid LIMIT 2`,
      [trimmed]
    );
    if (r.rows.length === 1) return { key: campaignKey(r.rows[0]), row: r.rows[0] };
    if (r.rows.length > 1) {
      const err = new Error('Multiple ROI rows for campaign_id; pass campaign_key');
      err.code = 'AMBIGUOUS';
      throw err;
    }
  }

  const r2 = await pool.query(
    `SELECT * FROM v_campaign_roi_summary WHERE utm_campaign = $1 LIMIT 2`,
    [trimmed]
  );
  if (r2.rows.length === 1) return { key: campaignKey(r2.rows[0]), row: r2.rows[0] };
  if (r2.rows.length > 1) {
    const err = new Error('Multiple buckets share utm_campaign; pass campaign_key');
    err.code = 'AMBIGUOUS';
    throw err;
  }

  const err = new Error('Unknown campaign: no matching row in v_campaign_roi_summary');
  err.code = 'NOT_FOUND';
  throw err;
}

/**
 * @param {object} body
 * @param {string} body.campaign
 * @param {string} body.action
 * @param {'approved'|'rejected'} body.status
 * @param {string} [body.notes]
 * @param {string} [body.reviewed_by]
 * @param {string} [body.campaign_key]
 */
async function submitReview(body = {}) {
  const status = String(body.status || '').toLowerCase().trim();
  if (!REVIEW_STATUSES.has(status)) {
    const err = new Error('status must be approved or rejected');
    err.code = 'VALIDATION';
    throw err;
  }

  const action = String(body.action || '').toLowerCase().replace(/\s+/g, '_').trim();
  if (!ALLOWED_ACTIONS.has(action)) {
    const err = new Error('Invalid action');
    err.code = 'VALIDATION';
    throw err;
  }

  const { key } = await resolveCampaignKeyFromView({
    campaign: body.campaign,
    campaign_key: body.campaign_key,
  });

  const notes = body.notes != null ? String(body.notes).slice(0, 4000) : null;
  const reviewedBy =
    (body.reviewed_by != null && String(body.reviewed_by).trim()) ||
    'dashboard';

  let detailsJson = null;
  if (body.details != null && typeof body.details === 'object') {
    try {
      detailsJson = JSON.stringify(body.details);
    } catch (_) {
      detailsJson = null;
    }
  }

  try {
    const ins = await pool.query(
      `INSERT INTO campaign_action_plan_executions (
         campaign_key, action, status, notes, details, reviewed_by, reviewed_at, created_by
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW(), $7)
       RETURNING id, campaign_key, action, status, notes, details, reviewed_by, reviewed_at, recorded_at`,
      [key, action, status, notes, detailsJson, reviewedBy, 'campaign-plan-review']
    );
    return ins.rows[0];
  } catch (e) {
    if (/column \"details\" does not exist/i.test(e.message || '')) {
      const ins2 = await pool.query(
        `INSERT INTO campaign_action_plan_executions (
           campaign_key, action, status, notes, reviewed_by, reviewed_at, created_by
         ) VALUES ($1, $2, $3, $4, $5, NOW(), $6)
         RETURNING id, campaign_key, action, status, notes, reviewed_by, reviewed_at, recorded_at`,
        [key, action, status, notes, reviewedBy, 'campaign-plan-review']
      );
      return ins2.rows[0];
    }
    if (/column .*status|reviewed_by|reviewed_at/i.test(e.message || '')) {
      const err = new Error('Run migration 036_campaign_action_plan_review.sql');
      err.code = 'MIGRATION_REQUIRED';
      throw err;
    }
    throw e;
  }
}

async function listReviewHistory(limit = 100) {
  const lim = Math.min(500, Math.max(1, parseInt(limit, 10) || 100));
  try {
    const r = await pool.query(
      `SELECT
         id,
         campaign_key,
         action,
         status,
         notes,
         reviewed_by,
         reviewed_at,
         recorded_at,
         created_by
       FROM campaign_action_plan_executions
       ORDER BY COALESCE(reviewed_at, recorded_at) DESC NULLS LAST
       LIMIT $1`,
      [lim]
    );
    return r.rows;
  } catch (e) {
    if (/column .*status/i.test(e.message || '')) {
      const r2 = await pool.query(
        `SELECT id, campaign_key, action, notes, NULL::text AS status,
                NULL::text AS reviewed_by, NULL::timestamptz AS reviewed_at,
                recorded_at, created_by
         FROM campaign_action_plan_executions
         ORDER BY recorded_at DESC NULLS LAST
         LIMIT $1`,
        [lim]
      );
      return r2.rows;
    }
    throw e;
  }
}

function displayFromRoiRow(row) {
  if (!row) return null;
  return String(row.utm_campaign || row.campaign_id || 'campaign').trim();
}

async function buildCampaignLabelMap() {
  const r = await pool.query(`SELECT campaign_id, utm_campaign FROM v_campaign_roi_summary`);
  const m = new Map();
  for (const row of r.rows) {
    m.set(campaignKey(row), displayFromRoiRow(row));
  }
  return m;
}

/**
 * Approved rows for executors: status = approved, plus executed_recently if a later executed
 * row exists for the same campaign_key + action (after this approval time).
 */
async function listApprovedReadyQueue() {
  try {
    const r = await pool.query(
      `SELECT
         a.id,
         a.campaign_key,
         a.action,
         a.details,
         a.notes,
         a.reviewed_by,
         a.reviewed_at,
         EXISTS (
           SELECT 1
           FROM campaign_action_plan_executions x
           WHERE x.campaign_key = a.campaign_key
             AND x.action = a.action
             AND x.status = 'executed'
             AND COALESCE(x.reviewed_at, x.recorded_at) > a.reviewed_at
         ) AS executed_recently
       FROM campaign_action_plan_executions a
       WHERE a.status = 'approved'
       ORDER BY a.reviewed_at ASC NULLS LAST`
    );
    const labels = await buildCampaignLabelMap();
    return r.rows.map((row) => ({
      id: row.id,
      campaign_key: row.campaign_key,
      campaign: labels.get(row.campaign_key) || row.campaign_key,
      action: row.action,
      details: row.details != null ? row.details : null,
      notes: row.notes,
      reviewed_by: row.reviewed_by,
      reviewed_at: row.reviewed_at,
      executed_recently: Boolean(row.executed_recently),
    }));
  } catch (e) {
    if (/column \"details\" does not exist/i.test(e.message || '')) {
      const r2 = await pool.query(
        `SELECT
           a.id,
           a.campaign_key,
           a.action,
           a.notes,
           a.reviewed_by,
           a.reviewed_at,
           EXISTS (
             SELECT 1
             FROM campaign_action_plan_executions x
             WHERE x.campaign_key = a.campaign_key
               AND x.action = a.action
               AND x.status = 'executed'
               AND COALESCE(x.reviewed_at, x.recorded_at) > a.reviewed_at
           ) AS executed_recently
         FROM campaign_action_plan_executions a
         WHERE a.status = 'approved'
         ORDER BY a.reviewed_at ASC NULLS LAST`
      );
      const labels = await buildCampaignLabelMap();
      return r2.rows.map((row) => ({
        id: row.id,
        campaign_key: row.campaign_key,
        campaign: labels.get(row.campaign_key) || row.campaign_key,
        action: row.action,
        details: null,
        notes: row.notes,
        reviewed_by: row.reviewed_by,
        reviewed_at: row.reviewed_at,
        executed_recently: Boolean(row.executed_recently),
      }));
    }
    throw e;
  }
}

module.exports = {
  submitReview,
  listReviewHistory,
  listApprovedReadyQueue,
  resolveCampaignKeyFromView,
  buildCampaignLabelMap,
  ALLOWED_ACTIONS,
  REVIEW_STATUSES,
};
