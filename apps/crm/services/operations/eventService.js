/**
 * Operational events — read/query layer (PR7A).
 * Detectors write via createOperationalEvent; no auto-detection here.
 */

const { pool } = require('../../lib/db');
const { rankEventsByAttention } = require('./eventPriority');

const VALID_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const VALID_STATUSES = new Set(['open', 'resolved', 'dismissed']);
const VALID_TERMINAL_STATUSES = new Set(['resolved', 'dismissed']);

const EXAMPLE_EVENT_TYPES = [
  'collections_risk',
  'cashflow_risk',
  'unreplied_lead',
  'unreplied_sms',
  'builder_research_needed',
  'builder_followup',
  'builder_reply_received',
  'builder_meeting_needed',
  'builder_target',
  'sync_issue',
  'data_quality_issue',
  'operational_load',
];

/** Builder intelligence events (PR8A — types only; detectors in PR8B+) */
const BUILDER_EVENT_TYPES = [
  'builder_research_needed',
  'builder_followup',
  'builder_reply_received',
  'builder_meeting_needed',
  'builder_target',
];

const MAX_LIST_LIMIT = 100;
const DEFAULT_LIST_LIMIT = 50;

function parseJsonField(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

const EVENT_SELECT_COLUMNS = `id, event_type, event_key, severity, attention_score, source, entity_type, entity_id,
           title, summary, status, payload, detected_at, resolved_at`;

function rowToEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    event_type: row.event_type,
    event_key: row.event_key || null,
    severity: row.severity,
    attention_score: Number(row.attention_score) || 0,
    source: row.source || null,
    entity_type: row.entity_type || null,
    entity_id: row.entity_id || null,
    title: row.title,
    summary: row.summary || null,
    status: row.status,
    payload: parseJsonField(row.payload, {}),
    detected_at: row.detected_at,
    resolved_at: row.resolved_at || null,
  };
}

function clampLimit(raw, defaultLimit) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return defaultLimit;
  return Math.min(n, MAX_LIST_LIMIT);
}

function normalizeListFilters(filters = {}) {
  const status = filters.status != null && String(filters.status).trim() !== ''
    ? String(filters.status).trim().toLowerCase()
    : 'open';
  if (!VALID_STATUSES.has(status)) {
    const err = new Error(`Invalid status: ${status}`);
    err.code = 'INVALID_STATUS';
    throw err;
  }

  let severity = null;
  if (filters.severity != null && String(filters.severity).trim() !== '') {
    severity = String(filters.severity).trim().toLowerCase();
    if (!VALID_SEVERITIES.has(severity)) {
      const err = new Error(`Invalid severity: ${severity}`);
      err.code = 'INVALID_SEVERITY';
      throw err;
    }
  }

  let event_type = null;
  if (filters.event_type != null && String(filters.event_type).trim() !== '') {
    event_type = String(filters.event_type).trim().slice(0, 50);
  }

  return {
    status,
    severity,
    event_type,
    limit: clampLimit(filters.limit, DEFAULT_LIST_LIMIT),
  };
}

async function listOperationalEvents(filters = {}, options = {}) {
  const db = options.db || pool;
  const f = normalizeListFilters(filters);
  const params = [f.status];
  let sql = `
    SELECT ${EVENT_SELECT_COLUMNS}
    FROM operational_events
    WHERE status = $1`;

  if (f.severity) {
    params.push(f.severity);
    sql += ` AND severity = $${params.length}`;
  }
  if (f.event_type) {
    params.push(f.event_type);
    sql += ` AND event_type = $${params.length}`;
  }

  params.push(f.limit);
  sql += ` ORDER BY attention_score DESC, detected_at DESC LIMIT $${params.length}`;

  const r = await db.query(sql, params);
  return r.rows.map(rowToEvent);
}

async function getOperationalEventById(id, options = {}) {
  const db = options.db || pool;
  const r = await db.query(
    `SELECT ${EVENT_SELECT_COLUMNS} FROM operational_events WHERE id = $1`,
    [id]
  );
  return rowToEvent(r.rows[0]);
}

const TOP_ATTENTION_LIMIT = 5;

async function listOperationalEventsByAttention(filters = {}, options = {}) {
  const f = normalizeListFilters({ ...filters, status: filters.status || 'open' });
  const fetchLimit = Math.min(MAX_LIST_LIMIT, Math.max(f.limit, TOP_ATTENTION_LIMIT));
  const events = await listOperationalEvents(
    { ...f, limit: fetchLimit },
    options
  );
  const ranked = rankEventsByAttention(events);
  return ranked.slice(0, f.limit);
}

async function getTopAttentionEvents(limit = TOP_ATTENTION_LIMIT, options = {}) {
  const ranked = await listOperationalEventsByAttention(
    { status: 'open', limit: MAX_LIST_LIMIT },
    options
  );
  return ranked.slice(0, Math.min(limit, TOP_ATTENTION_LIMIT));
}

async function getOperationalEventsSummary(options = {}) {
  const db = options.db || pool;
  const r = await db.query(
    `SELECT
       COUNT(*)::int AS open_count,
       COUNT(*) FILTER (WHERE severity = 'critical')::int AS critical_count,
       COUNT(*) FILTER (WHERE severity = 'high')::int AS high_count,
       COALESCE(SUM(attention_score), 0)::int AS attention_score
     FROM operational_events
     WHERE status = 'open'`
  );
  const row = r.rows[0] || {};
  const top_attention = await getTopAttentionEvents(TOP_ATTENTION_LIMIT, options);
  return {
    open_count: Number(row.open_count) || 0,
    critical_count: Number(row.critical_count) || 0,
    high_count: Number(row.high_count) || 0,
    attention_score: Number(row.attention_score) || 0,
    top_attention,
  };
}

module.exports = {
  VALID_SEVERITIES,
  VALID_STATUSES,
  VALID_TERMINAL_STATUSES,
  EXAMPLE_EVENT_TYPES,
  BUILDER_EVENT_TYPES,
  MAX_LIST_LIMIT,
  DEFAULT_LIST_LIMIT,
  rowToEvent,
  parseJsonField,
  normalizeListFilters,
  listOperationalEvents,
  listOperationalEventsByAttention,
  getTopAttentionEvents,
  getOperationalEventById,
  getOperationalEventsSummary,
  TOP_ATTENTION_LIMIT,
};
