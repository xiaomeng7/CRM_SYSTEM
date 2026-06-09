/**
 * Builder Priority Detector (PR8E.1).
 * Creates builder_priority events for Band A builders OR strategic opportunity builders.
 */

const { pool } = require('../../../lib/db');
const { BUILDER_ENTITY_TYPE } = require('../../builder/builderProspectConstants');
const { PRIORITY_EVENT_THRESHOLD } = require('../../builder/targetSelection/calculateFounderPriorityScore');
const { upsertOperationalEvent } = require('../upsertOperationalEvent');
const { closeStaleDetectorEvents } = require('../closeResolvedEvents');

const EVENT_TYPE = 'builder_priority';
const SOURCE = 'builder_priority_detector';

function eventKeyForProspect(prospectId) {
  return `builder_priority:prospect:${prospectId}`;
}

function buildTitle(prospect) {
  const name = prospect.company_name || 'Builder';
  if (prospect.opportunity_potential === 'strategic') {
    return `Strategic Builder Opportunity: ${name}`;
  }
  return `Strategic Builder Opportunity: ${name}`;
}

function buildSummary(prospect, row) {
  const score = row.founder_priority_score ?? row.target_score;
  const band = row.founder_priority_band ?? row.target_band;
  const lines = [
    `Priority score ${score}/100 (${band})`,
    row.next_best_action ? `Recommended: ${row.next_best_action}` : null,
    prospect.relationship_strength
      ? `Relationship: ${prospect.relationship_strength.replace(/_/g, ' ')}`
      : null,
    prospect.opportunity_potential && prospect.opportunity_potential !== 'unknown'
      ? `Opportunity: ${prospect.opportunity_potential}`
      : null,
    'Builder should be contacted this week.',
  ].filter(Boolean);
  return lines.join('\n');
}

async function loadPriorityCandidates(db, threshold = PRIORITY_EVENT_THRESHOLD) {
  const r = await db.query(
    `SELECT
       ts.prospect_id,
       ts.target_score,
       ts.target_band,
       ts.founder_priority_score,
       ts.founder_priority_band,
       ts.next_best_action,
       ts.founder_priority_breakdown,
       ts.score_breakdown,
       p.company_name,
       p.suburb,
       p.website,
       p.relationship_stage,
       p.relationship_strength,
       p.opportunity_potential,
       p.timing_status,
       p.builder_type,
       p.fit_priority
     FROM builder_target_scores ts
     INNER JOIN b2b_prospects p ON p.id = ts.prospect_id
     WHERE p.prospect_type = 'builder'
       AND p.relationship_stage NOT IN ('inactive', 'not_fit')
       AND (
         COALESCE(ts.founder_priority_score, ts.target_score) >= $1
         OR p.opportunity_potential = 'strategic'
       )`,
    [threshold]
  );
  return r.rows;
}

/**
 * @param {object} [options]
 * @param {import('pg').Pool|import('pg').PoolClient} [options.db]
 * @param {boolean} [options.dryRun]
 * @param {function} [options.log]
 * @param {number} [options.threshold]
 */
async function runBuilderPriorityDetector(options = {}) {
  const db = options.db || pool;
  const dryRun = Boolean(options.dryRun);
  const log = options.log || (() => {});
  const threshold = options.threshold ?? PRIORITY_EVENT_THRESHOLD;

  const rows = await loadPriorityCandidates(db, threshold);
  const stats = {
    scanned: rows.length,
    upserted: 0,
    created: 0,
    updated: 0,
    closed_stale: 0,
    active_keys: [],
  };

  const activeKeys = [];

  for (const row of rows) {
    const event_key = eventKeyForProspect(row.prospect_id);
    activeKeys.push(event_key);

    const prospect = {
      company_name: row.company_name,
      suburb: row.suburb,
      website: row.website,
      relationship_stage: row.relationship_stage,
      relationship_strength: row.relationship_strength,
      opportunity_potential: row.opportunity_potential,
      timing_status: row.timing_status,
    };

    const score = row.founder_priority_score ?? row.target_score;
    const band = row.founder_priority_band ?? row.target_band;

    const eventInput = {
      event_key,
      event_type: EVENT_TYPE,
      severity: row.opportunity_potential === 'strategic' ? 'high' : 'medium',
      attention_score: Number(score),
      source: SOURCE,
      entity_type: BUILDER_ENTITY_TYPE,
      entity_id: row.prospect_id,
      title: buildTitle(prospect),
      summary: buildSummary(prospect, row),
      payload: {
        prospect_id: row.prospect_id,
        company_name: row.company_name,
        founder_priority_score: score,
        founder_priority_band: band,
        next_best_action: row.next_best_action,
        relationship_strength: row.relationship_strength,
        opportunity_potential: row.opportunity_potential,
        timing_status: row.timing_status,
        strategic: row.opportunity_potential === 'strategic',
      },
      detected_at: options.now || new Date(),
    };

    if (dryRun) {
      log(`[dry-run] ${event_key} score=${score}`);
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
    `Builder priority: candidates=${stats.scanned} upserted=${stats.upserted} closed_stale=${stats.closed_stale}`
  );

  return stats;
}

module.exports = {
  runBuilderPriorityDetector,
  eventKeyForProspect,
  EVENT_TYPE,
  PRIORITY_EVENT_THRESHOLD,
};
