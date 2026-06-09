/**
 * Operational event priority engine (PR7A.1).
 * Computes effective_attention_score for ranking open events on CEO Daily.
 */

const SEVERITY_BOOST = {
  critical: 40,
  high: 25,
  medium: 10,
  low: 0,
};

const EVENT_TYPE_BOOST = {
  collections_risk: 20,
  cashflow_risk: 20,
  builder_reply_received: 18,
  builder_target: 17,
  builder_priority: 18,
  builder_partner: 19,
  builder_meeting_needed: 16,
  builder_followup: 15,
  builder_research_needed: 12,
  unreplied_lead: 10,
  sync_issue: 5,
  data_quality_issue: 5,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function ageBoost(detectedAt, now = new Date()) {
  if (!detectedAt) return 0;
  const detected = new Date(detectedAt);
  if (Number.isNaN(detected.getTime())) return 0;
  const ageDays = (now.getTime() - detected.getTime()) / MS_PER_DAY;
  if (ageDays < 0) return 15;
  if (ageDays <= 1) return 15;
  if (ageDays <= 7) return 10;
  if (ageDays <= 30) return 5;
  return 0;
}

function severityBoost(severity) {
  const key = severity != null ? String(severity).trim().toLowerCase() : '';
  return SEVERITY_BOOST[key] ?? 0;
}

function eventTypeBoost(eventType) {
  const key = eventType != null ? String(eventType).trim().toLowerCase() : '';
  return EVENT_TYPE_BOOST[key] ?? 0;
}

/**
 * @param {object} event — event_type, severity, attention_score, detected_at, status
 * @param {Date} [now]
 * @returns {number} 0–100
 */
function computeEffectiveAttentionScore(event, now = new Date()) {
  if (!event) return 0;
  const status = event.status != null ? String(event.status).trim().toLowerCase() : 'open';
  if (status !== 'open') return 0;

  const base = Number(event.attention_score);
  const baseScore = Number.isFinite(base) ? base : 0;
  const total =
    baseScore +
    severityBoost(event.severity) +
    eventTypeBoost(event.event_type) +
    ageBoost(event.detected_at, now);

  return Math.max(0, Math.min(100, Math.round(total)));
}

function attachEffectiveAttentionScore(event, now = new Date()) {
  return {
    ...event,
    effective_attention_score: computeEffectiveAttentionScore(event, now),
  };
}

function compareByEffectiveAttention(a, b) {
  const diff = (b.effective_attention_score || 0) - (a.effective_attention_score || 0);
  if (diff !== 0) return diff;
  const at = a.detected_at ? new Date(a.detected_at).getTime() : 0;
  const bt = b.detected_at ? new Date(b.detected_at).getTime() : 0;
  return bt - at;
}

function rankEventsByAttention(events, now = new Date()) {
  return (events || [])
    .map((e) => attachEffectiveAttentionScore(e, now))
    .sort(compareByEffectiveAttention);
}

module.exports = {
  SEVERITY_BOOST,
  EVENT_TYPE_BOOST,
  ageBoost,
  severityBoost,
  eventTypeBoost,
  computeEffectiveAttentionScore,
  attachEffectiveAttentionScore,
  rankEventsByAttention,
};
