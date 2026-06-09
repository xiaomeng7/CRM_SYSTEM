/**
 * Close open operational events when a detector confirms the issue is gone (PR7A.2).
 */

const { pool } = require('../../lib/db');
const { rowToEvent } = require('./eventService');

const EVENT_RETURNING = `id, event_type, event_key, severity, attention_score, source, entity_type, entity_id,
  title, summary, status, payload, detected_at, resolved_at`;

/**
 * Resolve open events matching the given event_key values.
 *
 * @param {object} input
 * @param {string[]} input.event_keys — keys to close
 * @param {object} [options] — { db }
 * @returns {Promise<{ closed_count: number, events: object[] }>}
 */
async function closeResolvedEvents(input, options = {}) {
  const db = options.db || pool;
  const keys = Array.isArray(input?.event_keys) ? input.event_keys : [];
  const normalized = [
    ...new Set(
      keys
        .map((k) => (k != null ? String(k).trim() : ''))
        .filter(Boolean)
    ),
  ];

  if (!normalized.length) {
    return { closed_count: 0, events: [] };
  }

  const r = await db.query(
    `UPDATE operational_events
     SET status = 'resolved',
         resolved_at = NOW()
     WHERE status = 'open'
       AND event_key = ANY($1::text[])
     RETURNING ${EVENT_RETURNING}`,
    [normalized]
  );

  return {
    closed_count: r.rowCount || 0,
    events: r.rows.map(rowToEvent),
  };
}

/**
 * Close open events of event_type whose event_key is not in the active detector set.
 * Reuses closeResolvedEvents (paid / no longer at risk).
 *
 * @param {object} input
 * @param {string} input.event_type
 * @param {string[]} input.active_event_keys — keys still at risk this scan
 */
async function closeStaleDetectorEvents(input, options = {}) {
  const db = options.db || pool;
  const event_type = input?.event_type != null ? String(input.event_type).trim() : '';
  if (!event_type) {
    const err = new Error('event_type is required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const activeSet = new Set(
    (Array.isArray(input.active_event_keys) ? input.active_event_keys : [])
      .map((k) => (k != null ? String(k).trim() : ''))
      .filter(Boolean)
  );

  const open = await db.query(
    `SELECT event_key FROM operational_events
     WHERE status = 'open' AND event_type = $1 AND event_key IS NOT NULL`,
    [event_type]
  );

  const staleKeys = open.rows
    .map((row) => row.event_key)
    .filter((key) => key && !activeSet.has(key));

  if (!staleKeys.length) {
    return { closed_count: 0, events: [], stale_keys: [] };
  }

  const closed = await closeResolvedEvents({ event_keys: staleKeys }, options);
  return {
    ...closed,
    stale_keys: staleKeys,
  };
}

module.exports = { closeResolvedEvents, closeStaleDetectorEvents };
