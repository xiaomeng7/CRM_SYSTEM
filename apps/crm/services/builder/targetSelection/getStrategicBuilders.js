/**
 * Strategic builders — opportunity_potential = strategic (PR8E.1).
 */

const { pool } = require('../../../lib/db');
const { PROSPECT_TYPE_BUILDER } = require('../builderProspectConstants');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function parseLimit(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

async function getStrategicBuilders(filters = {}, options = {}) {
  const db = options.db || pool;
  const limit = parseLimit(filters.limit);
  const conditions = [
    `p.prospect_type = $1`,
    `p.opportunity_potential = 'strategic'`,
    `p.relationship_stage NOT IN ('inactive', 'not_fit')`,
  ];
  const params = [PROSPECT_TYPE_BUILDER, limit];

  const r = await db.query(
    `SELECT
       p.id AS prospect_id,
       p.company_name,
       p.website,
       p.suburb,
       p.builder_type,
       p.relationship_strength,
       p.opportunity_potential,
       p.timing_status,
       p.last_contacted_at,
       bp.estimated_fit_score,
       ts.founder_priority_score,
       ts.founder_priority_band,
       ts.next_best_action
     FROM b2b_prospects p
     LEFT JOIN builder_profiles bp ON bp.prospect_id = p.id
     LEFT JOIN builder_target_scores ts ON ts.prospect_id = p.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY
       ts.founder_priority_score DESC NULLS LAST,
       bp.estimated_fit_score DESC NULLS LAST,
       p.company_name ASC
     LIMIT $2`,
    params
  );

  const builders = r.rows.map((row, index) => ({
    rank: index + 1,
    prospect_id: row.prospect_id,
    company_name: row.company_name,
    website: row.website,
    suburb: row.suburb,
    builder_type: row.builder_type,
    relationship_strength: row.relationship_strength,
    opportunity_potential: row.opportunity_potential,
    timing_status: row.timing_status,
    estimated_fit_score: row.estimated_fit_score != null ? Number(row.estimated_fit_score) : null,
    founder_priority_score:
      row.founder_priority_score != null ? Number(row.founder_priority_score) : null,
    founder_priority_band: row.founder_priority_band || null,
    next_best_action: row.next_best_action || null,
    last_contacted_at: row.last_contacted_at,
  }));

  return { builders, count: builders.length };
}

module.exports = {
  getStrategicBuilders,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
