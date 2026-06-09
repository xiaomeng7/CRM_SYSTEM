/**
 * Builder Target Detector (PR8E).
 * Creates builder_target operational events for high-priority targets (score >= 90).
 */

const { pool } = require('../../../lib/db');
const { BUILDER_ENTITY_TYPE } = require('../../builder/builderProspectConstants');
const { TARGET_EVENT_THRESHOLD } = require('../../builder/targetSelection/calculateBuilderTargetScore');
const { upsertOperationalEvent } = require('../upsertOperationalEvent');
const { closeStaleDetectorEvents } = require('../closeResolvedEvents');

const EVENT_TYPE = 'builder_target';
const SOURCE = 'builder_target_detector';

function eventKeyForProspect(prospectId) {
  return `builder_target:prospect:${prospectId}`;
}

function buildTitle(prospect, targetScore, band) {
  const name = prospect.company_name || 'Builder';
  return `Top builder target (${band}): ${name} — score ${targetScore}`;
}

function buildSummary(prospect, row) {
  const lines = [
    `Target score ${row.target_score}/100 (${row.target_band})`,
    row.next_best_action ? `Next: ${row.next_best_action}` : null,
    prospect.relationship_stage ? `Stage: ${prospect.relationship_stage}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

async function loadTargetCandidates(db, threshold = TARGET_EVENT_THRESHOLD) {
  const r = await db.query(
    `SELECT
       ts.prospect_id,
       ts.target_score,
       ts.target_band,
       ts.next_best_action,
       ts.score_breakdown,
       p.company_name,
       p.suburb,
       p.website,
       p.relationship_stage,
       p.builder_type,
       p.fit_priority
     FROM builder_target_scores ts
     INNER JOIN b2b_prospects p ON p.id = ts.prospect_id
     WHERE p.prospect_type = 'builder'
       AND ts.target_score >= $1
       AND p.relationship_stage NOT IN ('inactive', 'not_fit')`,
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
async function runBuilderTargetDetector(options = {}) {
  const db = options.db || pool;
  const dryRun = Boolean(options.dryRun);
  const log = options.log || (() => {});
  const threshold = options.threshold ?? TARGET_EVENT_THRESHOLD;

  const rows = await loadTargetCandidates(db, threshold);
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
    };

    const eventInput = {
      event_key,
      event_type: EVENT_TYPE,
      severity: 'high',
      attention_score: Number(row.target_score),
      source: SOURCE,
      entity_type: BUILDER_ENTITY_TYPE,
      entity_id: row.prospect_id,
      title: buildTitle(prospect, row.target_score, row.target_band),
      summary: buildSummary(prospect, row),
      payload: {
        prospect_id: row.prospect_id,
        company_name: row.company_name,
        target_score: row.target_score,
        target_band: row.target_band,
        next_best_action: row.next_best_action,
        relationship_stage: row.relationship_stage,
        estimated_fit_score: row.score_breakdown?.components?.find(
          (c) => c.component === 'research_fit'
        )?.detail?.estimated_fit_score,
      },
      detected_at: options.now || new Date(),
    };

    if (dryRun) {
      log(`[dry-run] ${event_key} score=${row.target_score}`);
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
    `Builder targets: candidates=${stats.scanned} upserted=${stats.upserted} closed_stale=${stats.closed_stale}`
  );

  return stats;
}

module.exports = {
  runBuilderTargetDetector,
  eventKeyForProspect,
  EVENT_TYPE,
  TARGET_EVENT_THRESHOLD,
};
