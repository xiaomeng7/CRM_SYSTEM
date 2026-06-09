/**
 * Refresh all builder target scores (PR8E).
 */

const { pool } = require('../../../lib/db');
const { PROSPECT_TYPE_BUILDER } = require('../builderProspectConstants');
const { calculateBuilderTargetScore } = require('./calculateBuilderTargetScore');
const { buildTargetAction } = require('./buildTargetAction');
const { runBuilderTargetDetector } = require('../../operations/detectors/builderTargetDetector');

async function loadBuilderProspectsWithProfiles(db) {
  const r = await db.query(
    `SELECT
       p.*,
       bp.estimated_fit_score,
       bp.last_researched_at AS profile_last_researched_at,
       bp.id AS profile_id
     FROM b2b_prospects p
     LEFT JOIN builder_profiles bp ON bp.prospect_id = p.id
     WHERE p.prospect_type = $1
     ORDER BY p.created_at ASC`,
    [PROSPECT_TYPE_BUILDER]
  );
  return r.rows;
}

async function loadOpenFollowupEvents(db) {
  const r = await db.query(
    `SELECT entity_id, payload, detected_at
     FROM operational_events
     WHERE status = 'open'
       AND event_type = 'builder_followup'
       AND entity_type = 'b2b_prospect'
       AND entity_id IS NOT NULL`
  );
  const map = new Map();
  for (const row of r.rows) {
    let payload = row.payload;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (_) {
        payload = {};
      }
    }
    map.set(row.entity_id, { payload, detected_at: row.detected_at });
  }
  return map;
}

async function upsertTargetScore(prospectId, data, db) {
  const r = await db.query(
    `INSERT INTO builder_target_scores (
       prospect_id, target_score, target_band, next_best_action, score_breakdown, calculated_at
     ) VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
     ON CONFLICT (prospect_id) DO UPDATE SET
       target_score = EXCLUDED.target_score,
       target_band = EXCLUDED.target_band,
       next_best_action = EXCLUDED.next_best_action,
       score_breakdown = EXCLUDED.score_breakdown,
       calculated_at = NOW()
     RETURNING *`,
    [
      prospectId,
      data.target_score,
      data.target_band,
      data.next_best_action,
      JSON.stringify(data.score_breakdown),
    ]
  );
  return r.rows[0];
}

/**
 * @param {object} [options]
 * @param {import('pg').Pool|import('pg').PoolClient} [options.db]
 * @param {boolean} [options.runDetector=true]
 * @param {function} [options.log]
 */
async function refreshBuilderTargetScores(options = {}) {
  const db = options.db || pool;
  const log = options.log || (() => {});
  const now = options.now || new Date();

  const prospects = await loadBuilderProspectsWithProfiles(db);
  const followupMap = await loadOpenFollowupEvents(db);

  const stats = {
    scanned: prospects.length,
    upserted: 0,
    bands: { A: 0, B: 0, C: 0, D: 0 },
    detector: null,
  };

  for (const row of prospects) {
    const profile = row.profile_id
      ? {
          estimated_fit_score: row.estimated_fit_score,
          last_researched_at: row.profile_last_researched_at,
        }
      : null;

    const openFollowupEvent = followupMap.has(row.id)
      ? { payload: followupMap.get(row.id).payload }
      : null;

    const scoreResult = calculateBuilderTargetScore({
      prospect: row,
      profile,
      openFollowupEvent,
      now,
    });

    const next_best_action = buildTargetAction(row, profile, scoreResult);

    await upsertTargetScore(
      row.id,
      {
        ...scoreResult,
        next_best_action,
      },
      db
    );

    stats.upserted++;
    stats.bands[scoreResult.target_band] = (stats.bands[scoreResult.target_band] || 0) + 1;
  }

  log(
    `Target scores refreshed: scanned=${stats.scanned} bands A=${stats.bands.A} B=${stats.bands.B} C=${stats.bands.C} D=${stats.bands.D}`
  );

  if (options.runDetector !== false) {
    stats.detector = await runBuilderTargetDetector({ db, now, log });
  }

  return stats;
}

module.exports = {
  refreshBuilderTargetScores,
  upsertTargetScore,
  loadBuilderProspectsWithProfiles,
};
