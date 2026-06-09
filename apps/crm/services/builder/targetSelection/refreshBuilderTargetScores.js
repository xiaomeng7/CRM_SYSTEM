/**
 * Refresh builder scores — prospect priority vs partner value (PR8E.3).
 */

const { pool } = require('../../../lib/db');
const { PROSPECT_TYPE_BUILDER } = require('../builderProspectConstants');
const { calculateBuilderTargetScore } = require('./calculateBuilderTargetScore');
const { calculateFounderPriorityScore } = require('./calculateFounderPriorityScore');
const {
  calculatePartnerValueScore,
  isPartnerBuilderStatus,
} = require('./calculatePartnerValueScore');
const { buildTargetAction } = require('./buildTargetAction');
const { runBuilderPriorityDetector } = require('../../operations/detectors/builderPriorityDetector');
const { runBuilderPartnerDetector } = require('../../operations/detectors/builderPartnerDetector');

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
       prospect_id,
       target_score,
       target_band,
       next_best_action,
       score_breakdown,
       founder_priority_score,
       founder_priority_band,
       founder_priority_breakdown,
       partner_value_score,
       partner_value_band,
       partner_value_breakdown,
       score_kind,
       calculated_at
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb,$9,$10,$11::jsonb,$12,NOW())
     ON CONFLICT (prospect_id) DO UPDATE SET
       target_score = EXCLUDED.target_score,
       target_band = EXCLUDED.target_band,
       next_best_action = EXCLUDED.next_best_action,
       score_breakdown = EXCLUDED.score_breakdown,
       founder_priority_score = EXCLUDED.founder_priority_score,
       founder_priority_band = EXCLUDED.founder_priority_band,
       founder_priority_breakdown = EXCLUDED.founder_priority_breakdown,
       partner_value_score = EXCLUDED.partner_value_score,
       partner_value_band = EXCLUDED.partner_value_band,
       partner_value_breakdown = EXCLUDED.partner_value_breakdown,
       score_kind = EXCLUDED.score_kind,
       calculated_at = NOW()
     RETURNING *`,
    [
      prospectId,
      data.target_score,
      data.target_band,
      data.next_best_action,
      JSON.stringify(data.score_breakdown),
      data.founder_priority_score ?? null,
      data.founder_priority_band ?? null,
      data.founder_priority_breakdown ? JSON.stringify(data.founder_priority_breakdown) : null,
      data.partner_value_score ?? null,
      data.partner_value_band ?? null,
      data.partner_value_breakdown ? JSON.stringify(data.partner_value_breakdown) : null,
      data.score_kind ?? null,
    ]
  );
  return r.rows[0];
}

function computeScoresForBuilder(row, profile, openFollowupEvent, now) {
  const legacyScore = calculateBuilderTargetScore({
    prospect: row,
    profile,
    openFollowupEvent,
    now,
  });

  const builderStatus = row.builder_status || 'prospect';

  if (isPartnerBuilderStatus(builderStatus)) {
    const partnerScore = calculatePartnerValueScore({ prospect: row, profile, now });
    return {
      ...partnerScore,
      founder_priority_score: null,
      founder_priority_band: null,
      founder_priority_breakdown: null,
      target_score: partnerScore.partner_value_score,
      target_band: partnerScore.partner_value_band,
      score_breakdown: {
        legacy: legacyScore.score_breakdown,
        partner_value: partnerScore.partner_value_breakdown,
      },
    };
  }

  const priorityScore = calculateFounderPriorityScore({
    prospect: row,
    profile,
    openFollowupEvent,
    now,
  });

  return {
    ...priorityScore,
    partner_value_score: null,
    partner_value_band: null,
    partner_value_breakdown: null,
    score_kind: 'prospect_priority',
    target_score: priorityScore.founder_priority_score,
    target_band: priorityScore.founder_priority_band,
    score_breakdown: {
      legacy: legacyScore.score_breakdown,
      founder_priority: priorityScore.founder_priority_breakdown,
    },
  };
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
    prospects: 0,
    partners: 0,
    detector: null,
    partner_detector: null,
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

    const scoreResult = computeScoresForBuilder(row, profile, openFollowupEvent, now);
    const next_best_action = buildTargetAction(row, profile, scoreResult);

    await upsertTargetScore(row.id, { ...scoreResult, next_best_action }, db);

    stats.upserted++;
    const band = scoreResult.target_band || 'D';
    stats.bands[band] = (stats.bands[band] || 0) + 1;
    if (isPartnerBuilderStatus(row.builder_status || 'prospect')) {
      stats.partners++;
    } else {
      stats.prospects++;
    }
  }

  log(
    `Scores refreshed: scanned=${stats.scanned} prospects=${stats.prospects} partners=${stats.partners} bands A=${stats.bands.A} B=${stats.bands.B} C=${stats.bands.C} D=${stats.bands.D}`
  );

  if (options.runDetector !== false) {
    stats.detector = await runBuilderPriorityDetector({ db, now, log });
    stats.partner_detector = await runBuilderPartnerDetector({ db, now, log });
  }

  return stats;
}

module.exports = {
  refreshBuilderTargetScores,
  upsertTargetScore,
  loadBuilderProspectsWithProfiles,
  computeScoresForBuilder,
};
