/**
 * Opportunities service — create, list, get, update stage.
 */

const { pool } = require('../lib/db');
const { emit } = require('../lib/domain-events');
const { scheduleOpportunityWonOfflineConversion } = require('./googleOfflineConversions');

const OPPORTUNITY_STAGES = [
  'new_inquiry',
  'attempting_contact',
  'qualified',
  'site_visit_booked',
  'inspection_done',
  'report_sent',
  'quote_sent',
  'decision_pending',
  'won',
  'lost',
];

/** Legacy stages mapped to new (for backward compatibility) */
const STAGE_LEGACY_TO_NEW = {
  discovery: 'new_inquiry',
  inspection_booked: 'site_visit_booked',
  inspection_completed: 'inspection_done',
  report_sent: 'report_sent',
};
/** Given a new stage, return DB values to match (new + legacy equiv) */
const STAGE_FILTER_VALUES = {
  new_inquiry: ['new_inquiry', 'discovery'],
  attempting_contact: ['attempting_contact'],
  qualified: ['qualified'],
  site_visit_booked: ['site_visit_booked', 'inspection_booked'],
  inspection_done: ['inspection_done', 'inspection_completed'],
  report_sent: ['report_sent'],
  quote_sent: ['quote_sent'],
  decision_pending: ['decision_pending'],
  won: ['won'],
  lost: ['lost'],
};

function isValidStage(s) {
  return s && OPPORTUNITY_STAGES.includes(s);
}

function normalizeStage(s) {
  if (!s) return 'new_inquiry';
  return STAGE_LEGACY_TO_NEW[s] || (isValidStage(s) ? s : 'new_inquiry');
}

function isValidUuid(s) {
  if (!s || typeof s !== 'string') return false;
  const u = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return u.test(s);
}

/**
 * Copy lead intake fields onto opportunity.intake_attribution (JSONB). No-op if no lead or column missing.
 * @param {import('pg').Pool|import('pg').PoolClient} db
 */
async function syncIntakeAttributionFromLead(db, opportunityId, leadId) {
  if (!opportunityId || !leadId || !isValidUuid(String(leadId))) return;
  try {
    const r = await db.query(`SELECT * FROM leads WHERE id = $1::uuid LIMIT 1`, [leadId]);
    const l = r.rows[0];
    if (!l) return;
    const keys = ['gclid', 'utm_campaign', 'utm_content', 'landing_page_version', 'creative_version'];
    const intake = {};
    for (const k of keys) {
      if (!Object.prototype.hasOwnProperty.call(l, k)) continue;
      const v = l[k];
      if (v != null && String(v).trim() !== '') intake[k] = String(v).trim();
    }
    await db.query(
      `UPDATE opportunities SET intake_attribution = $2::jsonb, updated_at = NOW() WHERE id = $1::uuid`,
      [opportunityId, JSON.stringify(intake)]
    );
  } catch (e) {
    const msg = String(e.message || '');
    if (/intake_attribution|column/i.test(msg)) return;
    console.warn('[opportunities] syncIntakeAttributionFromLead skipped:', msg);
  }
}

async function create(data = {}) {
  const { account_id, contact_id, lead_id, stage, value_estimate, created_by, metadata } = data;
  const s = stage && isValidStage(stage) ? stage : 'new_inquiry';
  const meta =
    metadata != null && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};

  const result = await pool.query(
    `INSERT INTO opportunities (account_id, contact_id, lead_id, stage, value_estimate, status, created_by, metadata)
     VALUES ($1, $2, $3, $4, $5, 'open', $6, $7::jsonb)
     RETURNING *`,
    [
      account_id && isValidUuid(account_id) ? account_id : null,
      contact_id && isValidUuid(contact_id) ? contact_id : null,
      lead_id && isValidUuid(lead_id) ? lead_id : null,
      s,
      value_estimate != null ? parseFloat(value_estimate) : null,
      created_by || null,
      JSON.stringify(meta),
    ]
  );
  const row = result.rows[0];
  if (row.lead_id) {
    await syncIntakeAttributionFromLead(pool, row.id, row.lead_id);
    const again = await pool.query(`SELECT * FROM opportunities WHERE id = $1`, [row.id]);
    if (again.rows[0]) Object.assign(row, again.rows[0]);
  }
  await emit('opportunity.created', 'opportunity', row.id, {
    opportunity_id: row.id,
    lead_id: row.lead_id,
    stage: row.stage,
  });
  return row;
}

async function list(filters = {}) {
  const { stage, account_id, limit = 100, offset = 0 } = filters;
  const params = [];
  let paramIndex = 1;
  const conditions = [];

  if (stage) {
    const norm = normalizeStage(stage);
    if (isValidStage(norm)) {
      const vals = STAGE_FILTER_VALUES[norm] || [norm];
      conditions.push(`o.stage = ANY($${paramIndex})`);
      params.push(vals);
      paramIndex++;
    }
  }
  if (account_id && isValidUuid(account_id)) {
    conditions.push(`o.account_id = $${paramIndex}`);
    params.push(account_id);
    paramIndex++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const result = await pool.query(
    `SELECT o.*, a.name AS account_name, c.name AS contact_name
     FROM opportunities o
     LEFT JOIN accounts a ON a.id = o.account_id
     LEFT JOIN contacts c ON c.id = o.contact_id
     ${where}
     ORDER BY o.created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    params
  );
  return result.rows;
}

async function getById(id) {
  if (!isValidUuid(id)) return null;
  const result = await pool.query(`SELECT * FROM opportunities WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

async function updateStage(id, newStage, createdBy = null, opts = {}) {
  if (!isValidUuid(id)) return null;
  if (!isValidStage(newStage)) {
    throw new Error(`Invalid stage: ${newStage}. Allowed: ${OPPORTUNITY_STAGES.join(', ')}`);
  }

  const existing = await getById(id);
  if (!existing) return null;

  const closedAt = ['won', 'lost'].includes(newStage) ? new Date() : null;
  const updateCols = ['stage = $1', 'closed_at = $2', 'updated_at = NOW()', "created_by = COALESCE($3, created_by)"];
  const updateParams = [newStage, closedAt, createdBy, id];
  if (newStage === 'won') {
    updateCols.push('won_at = COALESCE(won_at, NOW())');
  } else if (newStage === 'lost') {
    updateCols.push('lost_at = COALESCE(lost_at, NOW())');
  }
  if (opts.stage_locked !== undefined) {
    updateCols.push('stage_locked = $5');
    updateParams.push(!!opts.stage_locked);
  }
  const result = await pool.query(
    `UPDATE opportunities SET ${updateCols.join(', ')} WHERE id = $4 RETURNING *`,
    updateParams
  );
  const row = result.rows[0];
  await emit('opportunity.stage_changed', 'opportunity', row.id, {
    opportunity_id: row.id,
    previous_stage: existing.stage,
    new_stage: row.stage,
  });
  if (newStage === 'won' && existing.stage !== 'won') {
    scheduleOpportunityWonOfflineConversion(pool, row.id, {
      source: 'opportunities.updateStage',
      sourcePayload: { previous_stage: existing.stage },
    });
  }
  return row;
}

module.exports = {
  create,
  list,
  getById,
  updateStage,
  syncIntakeAttributionFromLead,
  OPPORTUNITY_STAGES,
  STAGE_LEGACY_TO_NEW,
  STAGE_FILTER_VALUES,
  normalizeStage,
};
