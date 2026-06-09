/**
 * Resolve or dismiss an operational event (founder action).
 */

const { pool } = require('../../lib/db');
const { VALID_TERMINAL_STATUSES, rowToEvent } = require('./eventService');

/**
 * @param {string} id — event UUID
 * @param {object} [input]
 * @param {string} [input.status] — 'resolved' | 'dismissed' (default resolved)
 * @param {object} [options] — { db }
 */
async function resolveOperationalEvent(id, input = {}, options = {}) {
  const db = options.db || pool;
  const eventId = id != null ? String(id).trim() : '';
  if (!eventId) {
    const err = new Error('Event id is required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  let status = input.status != null ? String(input.status).trim().toLowerCase() : 'resolved';
  if (!VALID_TERMINAL_STATUSES.has(status)) {
    const err = new Error(`Invalid status: ${status}`);
    err.code = 'INVALID_STATUS';
    throw err;
  }

  const r = await db.query(
    `UPDATE operational_events
     SET status = $2,
         resolved_at = NOW()
     WHERE id = $1 AND status = 'open'
     RETURNING id, event_type, event_key, severity, attention_score, source, entity_type, entity_id,
               title, summary, status, payload, detected_at, resolved_at`,
    [eventId, status]
  );

  if (!r.rows.length) {
    const existing = await db.query(`SELECT id, status FROM operational_events WHERE id = $1`, [eventId]);
    if (!existing.rows.length) {
      const err = new Error('Event not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    const err = new Error(`Event is not open (current status: ${existing.rows[0].status})`);
    err.code = 'NOT_OPEN';
    throw err;
  }

  return rowToEvent(r.rows[0]);
}

module.exports = { resolveOperationalEvent };
