/**
 * Opportunities service — create, list, get, update stage.
 */

const { pool } = require('../lib/db');
const { emit } = require('../lib/domain-events');

const OPPORTUNITY_STAGES = [
  'discovery',
  'inspection_booked',
  'inspection_completed',
  'report_sent',
  'won',
  'lost',
];

function isValidStage(s) {
  return s && OPPORTUNITY_STAGES.includes(s);
}

function isValidUuid(s) {
  if (!s || typeof s !== 'string') return false;
  const u = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return u.test(s);
}

async function create(data = {}) {
  const { account_id, contact_id, lead_id, stage, value_estimate, created_by } = data;
  const s = stage && isValidStage(stage) ? stage : 'discovery';

  const result = await pool.query(
    `INSERT INTO opportunities (account_id, contact_id, lead_id, stage, value_estimate, status, created_by)
     VALUES ($1, $2, $3, $4, $5, 'open', $6)
     RETURNING *`,
    [
      account_id && isValidUuid(account_id) ? account_id : null,
      contact_id && isValidUuid(contact_id) ? contact_id : null,
      lead_id && isValidUuid(lead_id) ? lead_id : null,
      s,
      value_estimate != null ? parseFloat(value_estimate) : null,
      created_by || null,
    ]
  );
  const row = result.rows[0];
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

  if (stage && isValidStage(stage)) {
    conditions.push(`stage = $${paramIndex}`);
    params.push(stage);
    paramIndex++;
  }
  if (account_id && isValidUuid(account_id)) {
    conditions.push(`account_id = $${paramIndex}`);
    params.push(account_id);
    paramIndex++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const result = await pool.query(
    `SELECT * FROM opportunities ${where}
     ORDER BY created_at DESC
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

async function updateStage(id, newStage, createdBy = null) {
  if (!isValidUuid(id)) return null;
  if (!isValidStage(newStage)) {
    throw new Error(`Invalid stage: ${newStage}. Allowed: ${OPPORTUNITY_STAGES.join(', ')}`);
  }

  const existing = await getById(id);
  if (!existing) return null;

  const closedAt = ['won', 'lost'].includes(newStage) ? new Date() : null;
  const result = await pool.query(
    `UPDATE opportunities
     SET stage = $1, closed_at = $2, updated_at = NOW(), created_by = COALESCE($3, created_by)
     WHERE id = $4
     RETURNING *`,
    [newStage, closedAt, createdBy, id]
  );
  const row = result.rows[0];
  await emit('opportunity.stage_changed', 'opportunity', row.id, {
    opportunity_id: row.id,
    previous_stage: existing.stage,
    new_stage: row.stage,
  });
  return row;
}

module.exports = {
  create,
  list,
  getById,
  updateStage,
  OPPORTUNITY_STAGES,
};
