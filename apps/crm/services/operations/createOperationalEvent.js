/**
 * Create a single operational event (manual or future detector).
 * PR7A: no automatic detection — callers must invoke explicitly.
 */

const { pool } = require('../../lib/db');
const { rowToEvent } = require('./eventService');
const { normalizeEventInput } = require('./eventInput');

/**
 * @param {object} input
 * @param {string} [input.event_key] — optional; use upsertOperationalEvent for detector dedup
 * @param {object} [options] — { db }
 */
async function createOperationalEvent(input, options = {}) {
  const db = options.db || pool;
  const n = normalizeEventInput(input);

  const r = await db.query(
    `INSERT INTO operational_events (
       event_type, event_key, severity, attention_score, source, entity_type, entity_id,
       title, summary, status, payload, detected_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open', $10::jsonb, $11)
     RETURNING id, event_type, event_key, severity, attention_score, source, entity_type, entity_id,
               title, summary, status, payload, detected_at, resolved_at`,
    [
      n.event_type,
      n.event_key,
      n.severity,
      n.attention_score,
      n.source,
      n.entity_type,
      n.entity_id,
      n.title,
      n.summary,
      JSON.stringify(n.payload),
      n.detected_at,
    ]
  );

  return rowToEvent(r.rows[0]);
}

module.exports = { createOperationalEvent };
