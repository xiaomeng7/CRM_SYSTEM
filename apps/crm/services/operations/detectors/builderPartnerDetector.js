/**
 * Builder Partner Detector (PR8E.3).
 * Creates builder_partner events for strategic_partner builders needing attention.
 */

const { pool } = require('../../../lib/db');
const { BUILDER_ENTITY_TYPE } = require('../../builder/builderProspectConstants');
const { daysSinceContact } = require('../../builder/targetSelection/actionHelpers');
const { upsertOperationalEvent } = require('../upsertOperationalEvent');
const { closeStaleDetectorEvents } = require('../closeResolvedEvents');

const EVENT_TYPE = 'builder_partner';
const SOURCE = 'builder_partner_detector';
const CONTACT_IDLE_DAYS = 60;

function eventKeyForProspect(prospectId) {
  return `builder_partner:prospect:${prospectId}`;
}

function needsPartnerAttention(prospect, now) {
  const daysIdle = daysSinceContact(prospect.last_contacted_at, now);
  if (daysIdle != null && daysIdle > CONTACT_IDLE_DAYS) return true;
  const timing = prospect.timing_status || 'unknown';
  return timing === 'active_project' || timing === 'quoting_projects';
}

function buildTitle(prospect) {
  const name = prospect.company_name || 'Builder';
  return `Strategic Partner Requires Attention: ${name}`;
}

function buildSummary(prospect, row) {
  const daysIdle = daysSinceContact(prospect.last_contacted_at);
  const lines = [
    `${prospect.company_name || 'Builder'} has active projects and should be contacted.`,
    row.partner_value_score != null
      ? `Partner value ${row.partner_value_score}/100 (${row.partner_value_band || '—'})`
      : null,
    row.next_best_action ? `Recommended: ${row.next_best_action}` : null,
    daysIdle != null ? `Last contact: ${daysIdle} days ago` : 'No contact logged',
    prospect.timing_status && prospect.timing_status !== 'unknown'
      ? `Timing: ${prospect.timing_status.replace(/_/g, ' ')}`
      : null,
  ].filter(Boolean);
  return lines.join('\n');
}

async function loadPartnerCandidates(db) {
  const r = await db.query(
    `SELECT
       ts.prospect_id,
       ts.partner_value_score,
       ts.partner_value_band,
       ts.next_best_action,
       p.company_name,
       p.suburb,
       p.website,
       p.builder_status,
       p.relationship_strength,
       p.opportunity_potential,
       p.timing_status,
       p.last_contacted_at
     FROM b2b_prospects p
     LEFT JOIN builder_target_scores ts ON ts.prospect_id = p.id
     WHERE p.prospect_type = 'builder'
       AND p.builder_status = 'strategic_partner'
       AND p.relationship_stage NOT IN ('inactive', 'not_fit')`
  );
  return r.rows;
}

/**
 * @param {object} [options]
 * @param {import('pg').Pool|import('pg').PoolClient} [options.db]
 * @param {boolean} [options.dryRun]
 * @param {function} [options.log]
 */
async function runBuilderPartnerDetector(options = {}) {
  const db = options.db || pool;
  const dryRun = Boolean(options.dryRun);
  const log = options.log || (() => {});
  const now = options.now || new Date();

  const rows = await loadPartnerCandidates(db);
  const stats = {
    scanned: rows.length,
    eligible: 0,
    upserted: 0,
    created: 0,
    updated: 0,
    closed_stale: 0,
    active_keys: [],
  };

  const activeKeys = [];

  for (const row of rows) {
    const prospect = {
      company_name: row.company_name,
      suburb: row.suburb,
      website: row.website,
      builder_status: row.builder_status,
      relationship_strength: row.relationship_strength,
      opportunity_potential: row.opportunity_potential,
      timing_status: row.timing_status,
      last_contacted_at: row.last_contacted_at,
    };

    if (!needsPartnerAttention(prospect, now)) continue;
    stats.eligible++;

    const event_key = eventKeyForProspect(row.prospect_id);
    activeKeys.push(event_key);

    const eventInput = {
      event_key,
      event_type: EVENT_TYPE,
      severity: 'high',
      attention_score: Number(row.partner_value_score || 85),
      source: SOURCE,
      entity_type: BUILDER_ENTITY_TYPE,
      entity_id: row.prospect_id,
      title: buildTitle(prospect),
      summary: buildSummary(prospect, row),
      payload: {
        prospect_id: row.prospect_id,
        company_name: row.company_name,
        builder_status: row.builder_status,
        partner_value_score: row.partner_value_score,
        partner_value_band: row.partner_value_band,
        next_best_action: row.next_best_action,
        relationship_strength: row.relationship_strength,
        timing_status: row.timing_status,
        days_since_contact: daysSinceContact(row.last_contacted_at, now),
      },
      detected_at: now,
    };

    if (dryRun) {
      log(`[dry-run] ${event_key}`);
      stats.upserted++;
      continue;
    }

    const result = await upsertOperationalEvent(eventInput, { db });
    stats.upserted++;
    if (result.created) stats.created++;
    if (result.updated) stats.updated++;
  }

  stats.active_keys = activeKeys;

  if (!dryRun) {
    const closed = await closeStaleDetectorEvents(
      { event_type: EVENT_TYPE, active_event_keys: activeKeys },
      { db }
    );
    stats.closed_stale = closed.closed_count || 0;
  }

  log(
    `Builder partners: scanned=${stats.scanned} eligible=${stats.eligible} upserted=${stats.upserted} closed_stale=${stats.closed_stale}`
  );

  return stats;
}

module.exports = {
  runBuilderPartnerDetector,
  eventKeyForProspect,
  needsPartnerAttention,
  EVENT_TYPE,
  CONTACT_IDLE_DAYS,
};
