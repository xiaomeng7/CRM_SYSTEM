/**
 * Operational event actions — persistence helpers (PR7D).
 */

const { pool } = require('../../lib/db');

const VALID_STATUSES = new Set(['pending', 'approved', 'completed', 'dismissed']);
const VALID_SOURCES = new Set(['generator', 'manual']);
const TERMINAL_STATUSES = new Set(['completed', 'dismissed']);

const ACTION_RETURNING = `id, event_id, action_type, title, description, priority, status, source, payload, created_at, completed_at`;

function parseJsonField(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function rowToAction(row) {
  if (!row) return null;
  return {
    id: row.id,
    event_id: row.event_id,
    action_type: row.action_type,
    title: row.title,
    description: row.description || null,
    priority: Number(row.priority) || 0,
    status: row.status,
    source: row.source,
    payload: parseJsonField(row.payload, {}),
    created_at: row.created_at,
    completed_at: row.completed_at || null,
  };
}

async function listActionsForEvent(eventId, options = {}) {
  const db = options.db || pool;
  const status = options.status != null ? String(options.status).trim().toLowerCase() : null;
  let sql = `SELECT ${ACTION_RETURNING} FROM operational_event_actions WHERE event_id = $1`;
  const params = [eventId];
  if (status) {
    params.push(status);
    sql += ` AND status = $${params.length}`;
  }
  sql += ' ORDER BY priority ASC, created_at ASC';
  const r = await db.query(sql, params);
  return r.rows.map(rowToAction);
}

async function listActions(filters = {}, options = {}) {
  const db = options.db || pool;
  const params = [];
  let sql = `SELECT ${ACTION_RETURNING} FROM operational_event_actions WHERE 1=1`;

  if (filters.event_id) {
    params.push(filters.event_id);
    sql += ` AND event_id = $${params.length}`;
  }
  if (filters.status) {
    params.push(String(filters.status).trim().toLowerCase());
    sql += ` AND status = $${params.length}`;
  }

  sql += ' ORDER BY priority ASC, created_at ASC';
  const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 50, 1), 100);
  params.push(limit);
  sql += ` LIMIT $${params.length}`;

  const r = await db.query(sql, params);
  return r.rows.map(rowToAction);
}

async function deletePendingGeneratedActions(eventId, options = {}) {
  const db = options.db || pool;
  const r = await db.query(
    `DELETE FROM operational_event_actions
     WHERE event_id = $1 AND status = 'pending' AND source = 'generator'`,
    [eventId]
  );
  return r.rowCount || 0;
}

async function insertAction(input, options = {}) {
  const db = options.db || pool;
  const payload =
    input.payload != null && typeof input.payload === 'object' && !Array.isArray(input.payload)
      ? input.payload
      : {};

  const r = await db.query(
    `INSERT INTO operational_event_actions (
       event_id, action_type, title, description, priority, status, source, payload
     ) VALUES ($1, $2, $3, $4, $5, 'pending', 'generator', $6::jsonb)
     RETURNING ${ACTION_RETURNING}`,
    [
      input.event_id,
      input.action_type,
      input.title,
      input.description || null,
      input.priority,
      JSON.stringify(payload),
    ]
  );
  return rowToAction(r.rows[0]);
}

async function updateActionStatus(actionId, status, options = {}) {
  const db = options.db || pool;
  const next = String(status || '').trim().toLowerCase();
  if (!VALID_STATUSES.has(next)) {
    const err = new Error(`Invalid status: ${status}`);
    err.code = 'INVALID_STATUS';
    throw err;
  }
  const allowed = new Set(['approved', 'completed', 'dismissed']);
  if (!allowed.has(next)) {
    const err = new Error(`Status must be approved, completed, or dismissed`);
    err.code = 'INVALID_STATUS';
    throw err;
  }

  const completedAt = TERMINAL_STATUSES.has(next) ? 'NOW()' : 'NULL';
  const r = await db.query(
    `UPDATE operational_event_actions
     SET status = $2,
         completed_at = ${completedAt}
     WHERE id = $1
     RETURNING ${ACTION_RETURNING}`,
    [actionId, next]
  );
  if (!r.rows.length) {
    const err = new Error('Action not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  return rowToAction(r.rows[0]);
}

module.exports = {
  VALID_STATUSES,
  VALID_SOURCES,
  rowToAction,
  listActionsForEvent,
  listActions,
  deletePendingGeneratedActions,
  insertAction,
  updateActionStatus,
};
