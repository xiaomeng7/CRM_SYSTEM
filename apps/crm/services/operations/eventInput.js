/**
 * Shared validation for operational event writes.
 */

const { VALID_SEVERITIES } = require('./eventService');

function assertNonEmptyString(value, field, maxLen) {
  const s = value != null ? String(value).trim() : '';
  if (!s) {
    const err = new Error(`${field} is required`);
    err.code = 'INVALID_INPUT';
    throw err;
  }
  if (maxLen && s.length > maxLen) {
    const err = new Error(`${field} exceeds ${maxLen} characters`);
    err.code = 'INVALID_INPUT';
    throw err;
  }
  return s;
}

function normalizeEventInput(input) {
  const event_type = assertNonEmptyString(input.event_type, 'event_type', 50);
  const severity = assertNonEmptyString(input.severity, 'severity', 20).toLowerCase();
  if (!VALID_SEVERITIES.has(severity)) {
    const err = new Error(`Invalid severity: ${severity}`);
    err.code = 'INVALID_SEVERITY';
    throw err;
  }

  const title = assertNonEmptyString(input.title, 'title');
  const summary = input.summary != null ? String(input.summary).trim() || null : null;

  let attention_score = Number(input.attention_score);
  if (!Number.isFinite(attention_score)) attention_score = 0;
  attention_score = Math.max(0, Math.min(100, Math.round(attention_score)));

  const source =
    input.source != null ? String(input.source).trim().slice(0, 50) || null : null;
  const entity_type =
    input.entity_type != null ? String(input.entity_type).trim().slice(0, 50) || null : null;
  const entity_id = input.entity_id != null ? String(input.entity_id).trim() || null : null;

  const payload =
    input.payload != null && typeof input.payload === 'object' && !Array.isArray(input.payload)
      ? input.payload
      : {};

  const detected_at = input.detected_at != null ? new Date(input.detected_at) : new Date();
  if (Number.isNaN(detected_at.getTime())) {
    const err = new Error('Invalid detected_at');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const event_key =
    input.event_key != null ? assertNonEmptyString(input.event_key, 'event_key', 255) : null;

  return {
    event_type,
    severity,
    title,
    summary,
    attention_score,
    source,
    entity_type,
    entity_id,
    payload,
    detected_at,
    event_key,
  };
}

module.exports = { normalizeEventInput, assertNonEmptyString };
