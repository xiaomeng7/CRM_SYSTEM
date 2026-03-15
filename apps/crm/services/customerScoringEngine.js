/**
 * Customer Scoring Engine 2.0
 * Multidimensional scores: value, conversion, urgency, relationship → total_score & segment.
 * recalculateCustomerScore(contactId), updateAllCustomerScores().
 */

const { pool } = require('../lib/db');
const {
  SEGMENT,
  HOT_MIN_SCORE,
  WARM_MIN_SCORE,
  DORMANT_MAX_SCORE,
  DORMANT_LAST_CONTACT_DAYS,
  HIGH_VALUE_DORMANT_VALUE_MIN,
  WEIGHT_VALUE,
  WEIGHT_CONVERSION,
  WEIGHT_URGENCY,
  WEIGHT_RELATIONSHIP,
} = require('../lib/customer-scoring-constants');

const INBOUND_ACTIVITY_TYPES = ['inbound_sms', 'inbound_sms_unmatched'];
const OUTBOUND_ACTIVITY_TYPES = ['sms', 'outbound_sms', 'call'];

/**
 * Clamp and round score 0–100.
 */
function clampScore(v) {
  if (v == null || Number.isNaN(v)) return 0;
  return Math.round(Math.min(100, Math.max(0, Number(v))) * 100) / 100;
}

/**
 * Value Score 0–100: lifetime_spend, number_of_jobs, average_job_value.
 * Bands: spend (0/1k/3k/5k/10k+), jobs (0/1/3/5+), avg (0/500/1k/2k+).
 */
function computeValueScore(raw) {
  const spend = Number(raw.lifetime_spend) || 0;
  const jobs = Number(raw.number_of_jobs) || 0;
  const avg = jobs > 0 ? spend / jobs : 0;
  let s = 0;
  if (spend >= 10000) s += 40;
  else if (spend >= 5000) s += 30;
  else if (spend >= 3000) s += 22;
  else if (spend >= 1000) s += 15;
  else if (spend > 0) s += 8;
  if (jobs >= 5) s += 35;
  else if (jobs >= 3) s += 25;
  else if (jobs >= 1) s += 15;
  if (avg >= 2000) s += 25;
  else if (avg >= 1000) s += 15;
  else if (avg >= 500) s += 8;
  return clampScore(Math.min(100, s));
}

/**
 * Conversion Score 0–100: replied_sms_count, quote_accept_rate, last_interaction_days.
 */
function computeConversionScore(raw) {
  const replied = Number(raw.replied_sms_count) || 0;
  const acceptRate = raw.quote_accept_rate != null ? Number(raw.quote_accept_rate) : null;
  const lastInteractionDays = raw.last_interaction_days != null ? Number(raw.last_interaction_days) : null;
  let s = 0;
  if (replied >= 5) s += 40;
  else if (replied >= 2) s += 25;
  else if (replied >= 1) s += 12;
  if (acceptRate != null && !Number.isNaN(acceptRate)) {
    if (acceptRate >= 0.5) s += 35;
    else if (acceptRate >= 0.25) s += 20;
    else if (acceptRate > 0) s += 10;
  }
  if (lastInteractionDays != null && !Number.isNaN(lastInteractionDays)) {
    if (lastInteractionDays <= 7) s += 25;
    else if (lastInteractionDays <= 30) s += 15;
    else if (lastInteractionDays <= 90) s += 5;
  }
  return clampScore(Math.min(100, s));
}

/**
 * Urgency Score 0–100: open_quotes, recent_jobs, last_contact_days.
 */
function computeUrgencyScore(raw) {
  const openQuotes = Number(raw.open_quotes) || 0;
  const recentJobs = Number(raw.recent_jobs) || 0;
  const lastContactDays = raw.last_contact_days != null ? Number(raw.last_contact_days) : null;
  let s = 0;
  if (openQuotes >= 1) s += 40;
  if (recentJobs >= 2) s += 35;
  else if (recentJobs >= 1) s += 20;
  if (lastContactDays != null && !Number.isNaN(lastContactDays)) {
    if (lastContactDays <= 7) s += 25;
    else if (lastContactDays <= 30) s += 15;
    else if (lastContactDays <= 90) s += 5;
  }
  return clampScore(Math.min(100, s));
}

/**
 * Relationship Score 0–100: years_as_customer, complaint_count, review_score.
 */
function computeRelationshipScore(raw) {
  const years = raw.years_as_customer != null ? Number(raw.years_as_customer) : 0;
  const complaints = Number(raw.complaint_count) || 0;
  const review = raw.review_score != null ? Number(raw.review_score) : 50;
  let s = 0;
  if (years >= 3) s += 40;
  else if (years >= 1) s += 25;
  else if (years >= 0.25) s += 10;
  s -= Math.min(30, complaints * 15);
  if (review >= 80) s += 30;
  else if (review >= 60) s += 15;
  else if (review >= 40) s += 5;
  return clampScore(Math.min(100, Math.max(0, s)));
}

/**
 * Total score: weighted average of four dimensions.
 */
function computeTotalScore(value, conversion, urgency, relationship) {
  const t =
    value * WEIGHT_VALUE +
    conversion * WEIGHT_CONVERSION +
    urgency * WEIGHT_URGENCY +
    relationship * WEIGHT_RELATIONSHIP;
  return clampScore(t);
}

/**
 * Segment: Hot / Warm / Cold / Dormant / HighValueDormant.
 */
function computeSegment(totalScore, lastContactDays, valueScore) {
  const lastContact = lastContactDays != null && !Number.isNaN(lastContactDays) ? lastContactDays : 9999;
  if (totalScore < DORMANT_MAX_SCORE && lastContact > DORMANT_LAST_CONTACT_DAYS) {
    if (valueScore >= HIGH_VALUE_DORMANT_VALUE_MIN) return SEGMENT.HIGH_VALUE_DORMANT;
    return SEGMENT.DORMANT;
  }
  if (totalScore >= HOT_MIN_SCORE) return SEGMENT.HOT;
  if (totalScore >= WARM_MIN_SCORE) return SEGMENT.WARM;
  return SEGMENT.COLD;
}

/**
 * Fetch raw inputs for one contact (or all contacts when contactId is null).
 */
async function fetchRawInputs(db, contactId) {
  const contactFilter = contactId ? 'AND c.id = $3' : '';
  const simpleQuery = `
    SELECT
      c.id AS contact_id,
      COALESCE(SUM(i.amount), 0) AS lifetime_spend,
      COUNT(DISTINCT j.id)::int AS number_of_jobs,
      MIN(j.job_date) AS first_job_date,
      (SELECT COUNT(*) FROM activities a WHERE a.contact_id = c.id AND a.activity_type = ANY($1::text[]))::int AS replied_sms_count,
      (SELECT COUNT(*) FILTER (WHERE LOWER(TRIM(COALESCE(q.status, ''))) = 'accepted') FROM quotes q WHERE q.contact_id = c.id)::float / NULLIF((SELECT COUNT(*) FROM quotes q WHERE q.contact_id = c.id), 0) AS quote_accept_rate,
      (SELECT COUNT(*) FROM quotes q WHERE q.contact_id = c.id AND LOWER(TRIM(COALESCE(q.status, ''))) NOT IN ('accepted', 'declined'))::int AS open_quotes,
      (SELECT COUNT(*) FROM jobs j2 WHERE j2.contact_id = c.id AND (j2.job_date >= CURRENT_DATE - INTERVAL '90 days' OR j2.completed_at >= NOW() - INTERVAL '90 days'))::int AS recent_jobs,
      (SELECT MAX(occurred_at) FROM activities a WHERE a.contact_id = c.id) AS last_activity_at,
      (SELECT MAX(occurred_at) FROM activities a WHERE a.contact_id = c.id AND a.activity_type = ANY($2::text[])) AS last_outbound_at
    FROM contacts c
    LEFT JOIN jobs j ON j.contact_id = c.id
    LEFT JOIN invoices i ON i.job_id = j.id
    WHERE 1=1 ${contactFilter}
    GROUP BY c.id
  `;
  const res = await db.query(simpleQuery, contactId ? [INBOUND_ACTIVITY_TYPES, OUTBOUND_ACTIVITY_TYPES, contactId] : [INBOUND_ACTIVITY_TYPES, OUTBOUND_ACTIVITY_TYPES]);
  const rows = res.rows || [];
  return rows.map((r) => {
    const lastActivityAt = r.last_activity_at;
    const lastOutboundAt = r.last_outbound_at;
    const lastInteractionDays = lastActivityAt ? Math.floor((Date.now() - new Date(lastActivityAt)) / (24 * 60 * 60 * 1000)) : null;
    const lastContactDays = lastOutboundAt ? Math.floor((Date.now() - new Date(lastOutboundAt)) / (24 * 60 * 60 * 1000)) : null;
    const firstJobDate = r.first_job_date;
    const yearsAsCustomer = firstJobDate ? (Date.now() - new Date(firstJobDate)) / (365.25 * 24 * 60 * 60 * 1000) : 0;
    return {
      contact_id: r.contact_id,
      lifetime_spend: Number(r.lifetime_spend) || 0,
      number_of_jobs: Number(r.number_of_jobs) || 0,
      replied_sms_count: Number(r.replied_sms_count) || 0,
      quote_accept_rate: r.quote_accept_rate != null ? Number(r.quote_accept_rate) : null,
      open_quotes: Number(r.open_quotes) || 0,
      recent_jobs: Number(r.recent_jobs) || 0,
      last_interaction_days: lastInteractionDays,
      last_contact_days: lastContactDays,
      years_as_customer: yearsAsCustomer,
      complaint_count: 0,
      review_score: 50,
    };
  });
}

/**
 * Compute all scores and segment from raw inputs.
 */
function computeScores(raw) {
  const valueScore = computeValueScore(raw);
  const conversionScore = computeConversionScore(raw);
  const urgencyScore = computeUrgencyScore(raw);
  const relationshipScore = computeRelationshipScore(raw);
  const totalScore = computeTotalScore(valueScore, conversionScore, urgencyScore, relationshipScore);
  const lastContactDays = raw.last_contact_days;
  const segment = computeSegment(totalScore, lastContactDays, valueScore);
  return {
    value_score: valueScore,
    conversion_score: conversionScore,
    urgency_score: urgencyScore,
    relationship_score: relationshipScore,
    total_score: totalScore,
    segment,
    last_contact_days: lastContactDays != null ? Math.round(lastContactDays) : null,
  };
}

/**
 * Upsert one row into customer_scores.
 */
async function upsertScore(db, contactId, scores) {
  await db.query(
    `INSERT INTO customer_scores (contact_id, value_score, conversion_score, urgency_score, relationship_score, total_score, segment, last_contact_days, calculated_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
     ON CONFLICT (contact_id) DO UPDATE SET
       value_score = EXCLUDED.value_score,
       conversion_score = EXCLUDED.conversion_score,
       urgency_score = EXCLUDED.urgency_score,
       relationship_score = EXCLUDED.relationship_score,
       total_score = EXCLUDED.total_score,
       segment = EXCLUDED.segment,
       last_contact_days = EXCLUDED.last_contact_days,
       calculated_at = NOW(),
       updated_at = NOW()`,
    [
      contactId,
      scores.value_score,
      scores.conversion_score,
      scores.urgency_score,
      scores.relationship_score,
      scores.total_score,
      scores.segment,
      scores.last_contact_days,
    ]
  );
}

/**
 * Recalculate and persist score for one contact.
 */
async function recalculateCustomerScore(contactId, options = {}) {
  const db = options.db || pool;
  const rawRows = await fetchRawInputs(db, contactId);
  if (rawRows.length === 0) return null;
  const raw = rawRows[0];
  const scores = computeScores(raw);
  if (options.persist !== false) await upsertScore(db, contactId, scores);
  return { contact_id: contactId, ...scores };
}

/**
 * Batch: recalculate all contacts and persist. Optional onSegmentChange callback for CRM integration.
 */
async function updateAllCustomerScores(options = {}) {
  const db = options.db || pool;
  const log = options.log || (() => {});
  const onSegmentChange = options.onSegmentChange || null;
  const rawRows = await fetchRawInputs(db, null);
  log(`Customer scoring: ${rawRows.length} contacts to process`);
  let updated = 0;
  const previousSegments = new Map();
  if (onSegmentChange) {
    const prev = await db.query('SELECT contact_id, segment FROM customer_scores');
    prev.rows.forEach((r) => previousSegments.set(r.contact_id, r.segment));
  }
  for (const raw of rawRows) {
    const contactId = raw.contact_id;
    const scores = computeScores(raw);
    const prevSegment = previousSegments.get(contactId);
    await upsertScore(db, contactId, scores);
    updated++;
    if (onSegmentChange && prevSegment !== undefined && prevSegment !== scores.segment) {
      try {
        await onSegmentChange({ contactId, previousSegment: prevSegment, newSegment: scores.segment, scores }, options);
      } catch (e) {
        log(`Segment change hook error for ${contactId}: ${e?.message || e}`);
      }
    }
  }
  log(`Customer scoring: ${updated} scores updated`);
  return { processed: updated };
}

module.exports = {
  recalculateCustomerScore,
  updateAllCustomerScores,
  fetchRawInputs,
  computeScores,
  computeSegment,
  SEGMENT,
};
