/**
 * Domain events — append-only event log for automation and auditing.
 */

const { pool } = require('./db');

const VALID_EVENT_TYPES = new Set([
  'lead.created',
  'lead.status_changed',
  'lead.converted',
  'opportunity.created',
  'opportunity.stage_changed',
]);

/**
 * Emit a domain event. Inserts into domain_events; processed_at stays null for consumers.
 * @param {string} eventType
 * @param {string} aggregateType - e.g. 'lead', 'opportunity'
 * @param {string} aggregateId - UUID of the aggregate
 * @param {object} payload - optional JSON payload
 */
async function emit(eventType, aggregateType, aggregateId, payload = {}) {
  if (!VALID_EVENT_TYPES.has(eventType)) {
    throw new Error(`Unknown event type: ${eventType}`);
  }
  if (!aggregateType || !aggregateId) {
    throw new Error('aggregateType and aggregateId are required');
  }

  await pool.query(
    `INSERT INTO domain_events (event_type, aggregate_type, aggregate_id, payload, occurred_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [eventType, aggregateType, aggregateId, JSON.stringify(payload)]
  );
}

module.exports = { emit };
