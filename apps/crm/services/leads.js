/**
 * Leads service — create, list, get, update status, convert to opportunity.
 */

const { pool } = require('../lib/db');
const { emit } = require('../lib/domain-events');

const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'disqualified', 'converted'];

function isValidStatus(s) {
  return s && LEAD_STATUSES.includes(s);
}

function isValidUuid(s) {
  if (!s || typeof s !== 'string') return false;
  const u = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return u.test(s);
}

async function create(data = {}) {
  const { contact_id, account_id, source, created_by } = data;
  const result = await pool.query(
    `INSERT INTO leads (contact_id, account_id, source, status, created_by)
     VALUES ($1, $2, $3, 'new', $4)
     RETURNING *`,
    [
      contact_id && isValidUuid(contact_id) ? contact_id : null,
      account_id && isValidUuid(account_id) ? account_id : null,
      source || null,
      created_by || null,
    ]
  );
  const row = result.rows[0];
  await emit('lead.created', 'lead', row.id, { lead_id: row.id, source: row.source });
  return row;
}

async function list(filters = {}) {
  const { status, limit = 100, offset = 0 } = filters;
  const params = [];
  let paramIndex = 1;
  const conditions = [];

  if (status && isValidStatus(status)) {
    conditions.push(`l.status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const result = await pool.query(
    `SELECT
       l.id,
       l.status,
       l.source,
       l.created_at,
       c.name AS contact_name,
       c.email AS contact_email,
       c.phone AS contact_phone,
       a.suburb AS account_suburb
     FROM leads l
     LEFT JOIN contacts c ON l.contact_id = c.id
     LEFT JOIN accounts a ON l.account_id = a.id
     ${where}
     ORDER BY l.created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    params
  );
  return result.rows;
}

async function getById(id) {
  if (!isValidUuid(id)) return null;
  const result = await pool.query(`SELECT * FROM leads WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

async function updateStatus(id, newStatus, createdBy = null) {
  if (!isValidUuid(id)) return null;
  if (!isValidStatus(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}. Allowed: ${LEAD_STATUSES.join(', ')}`);
  }

  const existing = await getById(id);
  if (!existing) return null;
  if (existing.status === 'converted') {
    throw new Error('Cannot update status of a converted lead');
  }

  const result = await pool.query(
    `UPDATE leads SET status = $1, updated_at = NOW(), created_by = COALESCE($2, created_by)
     WHERE id = $3 RETURNING *`,
    [newStatus, createdBy, id]
  );
  const row = result.rows[0];
  await emit('lead.status_changed', 'lead', row.id, {
    lead_id: row.id,
    previous_status: existing.status,
    new_status: row.status,
  });
  return row;
}

async function convertToOpportunity(id, options = {}) {
  if (!isValidUuid(id)) return null;

  const lead = await getById(id);
  if (!lead) return null;
  if (lead.status === 'converted') {
    throw new Error('Lead is already converted');
  }

  const opportunities = require('./opportunities');
  const opportunity = await opportunities.create({
    account_id: lead.account_id,
    contact_id: lead.contact_id,
    lead_id: lead.id,
    stage: options.stage || 'discovery',
    value_estimate: options.value_estimate,
    created_by: options.created_by || lead.created_by,
  });

  await pool.query(
    `UPDATE leads SET status = 'converted', converted_opportunity_id = $1, updated_at = NOW()
     WHERE id = $2`,
    [opportunity.id, id]
  );

  await emit('lead.converted', 'lead', id, {
    lead_id: id,
    opportunity_id: opportunity.id,
  });

  const updatedLead = await getById(id);
  return { lead: updatedLead, opportunity };
}

module.exports = {
  create,
  list,
  getById,
  updateStatus,
  convertToOpportunity,
  LEAD_STATUSES,
};
