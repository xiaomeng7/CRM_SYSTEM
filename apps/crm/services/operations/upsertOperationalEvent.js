/**
 * Upsert operational event by event_key (PR7A.2).
 * One open row per event_key; updates in place when key already open.
 */

const { pool } = require('../../lib/db');
const { rowToEvent } = require('./eventService');
const { normalizeEventInput, assertNonEmptyString } = require('./eventInput');

const EVENT_RETURNING = `id, event_type, event_key, severity, attention_score, source, entity_type, entity_id,
  title, summary, status, payload, detected_at, resolved_at`;

/**
 * @param {object} input — same as createOperationalEvent + required event_key
 * @param {object} [options] — { db }
 * @returns {Promise<{ event: object, created: boolean, updated: boolean }>}
 */
async function upsertOperationalEvent(input, options = {}) {
  const db = options.db || pool;
  const normalized = normalizeEventInput(input);
  const event_key = assertNonEmptyString(normalized.event_key, 'event_key', 255);

  const existing = await db.query(
    `SELECT id FROM operational_events WHERE event_key = $1 AND status = 'open' LIMIT 1`,
    [event_key]
  );

  if (existing.rows.length > 0) {
    const r = await db.query(
      `UPDATE operational_events SET
         attention_score = $2,
         summary = $3,
         payload = $4::jsonb,
         detected_at = $5
       WHERE id = $1 AND status = 'open'
       RETURNING ${EVENT_RETURNING}`,
      [
        existing.rows[0].id,
        normalized.attention_score,
        normalized.summary,
        JSON.stringify(normalized.payload),
        normalized.detected_at,
      ]
    );
    return {
      event: rowToEvent(r.rows[0]),
      created: false,
      updated: true,
    };
  }

  const r = await db.query(
    `INSERT INTO operational_events (
       event_type, event_key, severity, attention_score, source, entity_type, entity_id,
       title, summary, status, payload, detected_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open', $10::jsonb, $11)
     RETURNING ${EVENT_RETURNING}`,
    [
      normalized.event_type,
      event_key,
      normalized.severity,
      normalized.attention_score,
      normalized.source,
      normalized.entity_type,
      normalized.entity_id,
      normalized.title,
      normalized.summary,
      JSON.stringify(normalized.payload),
      normalized.detected_at,
    ]
  );

  return {
    event: rowToEvent(r.rows[0]),
    created: true,
    updated: false,
  };
}

module.exports = { upsertOperationalEvent };
