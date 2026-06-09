/**
 * Query Contact This Week — sorted by founder_priority_score (PR8E.1).
 */

const { pool } = require('../../../lib/db');
const { PROSPECT_TYPE_BUILDER } = require('../builderProspectConstants');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parseLimit(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

/**
 * @param {object} [filters]
 * @param {number|string} [filters.limit]
 * @param {string} [filters.band] — A|B|C|D (founder priority band)
 */
async function getTopBuilderTargets(filters = {}, options = {}) {
  const db = options.db || pool;
  const limit = parseLimit(filters.limit);
  const conditions = [`p.prospect_type = $1`];
  const params = [PROSPECT_TYPE_BUILDER];

  if (!filters.include_excluded) {
    conditions.push(`p.relationship_stage NOT IN ('inactive', 'not_fit')`);
  }

  if (filters.band) {
    params.push(String(filters.band).trim().toUpperCase());
    conditions.push(`COALESCE(ts.founder_priority_band, ts.target_band) = $${params.length}`);
  }

  if (filters.suburb) {
    params.push(`%${String(filters.suburb).trim()}%`);
    conditions.push(`p.suburb ILIKE $${params.length}`);
  }

  if (filters.builder_type) {
    params.push(String(filters.builder_type).trim());
    conditions.push(`p.builder_type = $${params.length}`);
  }

  params.push(limit);
  const where = conditions.join(' AND ');

  const r = await db.query(
    `SELECT
       p.id AS prospect_id,
       p.company_name,
       p.website,
       p.suburb,
       p.builder_type,
       p.project_focus,
       p.relationship_stage,
       p.relationship_strength,
       p.opportunity_potential,
       p.timing_status,
       p.fit_priority,
       p.research_status,
       p.last_contacted_at,
       p.next_followup_at,
       bp.estimated_fit_score,
       bp.last_researched_at,
       ts.target_score,
       ts.target_band,
       ts.founder_priority_score,
       ts.founder_priority_band,
       ts.next_best_action,
       ts.score_breakdown,
       ts.founder_priority_breakdown,
       ts.calculated_at
     FROM builder_target_scores ts
     INNER JOIN b2b_prospects p ON p.id = ts.prospect_id
     LEFT JOIN builder_profiles bp ON bp.prospect_id = p.id
     WHERE ${where}
     ORDER BY COALESCE(ts.founder_priority_score, ts.target_score) DESC, ts.calculated_at DESC
     LIMIT $${params.length}`,
    params
  );

  const targets = r.rows.map((row, index) => {
    const priorityScore =
      row.founder_priority_score != null ? Number(row.founder_priority_score) : Number(row.target_score);
    const priorityBand = row.founder_priority_band || row.target_band;
    return {
      rank: index + 1,
      prospect_id: row.prospect_id,
      company_name: row.company_name,
      website: row.website,
      suburb: row.suburb,
      builder_type: row.builder_type,
      project_focus: row.project_focus,
      relationship_stage: row.relationship_stage,
      relationship_strength: row.relationship_strength,
      opportunity_potential: row.opportunity_potential,
      timing_status: row.timing_status,
      fit_priority: row.fit_priority,
      research_status: row.research_status,
      estimated_fit_score: row.estimated_fit_score != null ? Number(row.estimated_fit_score) : null,
      target_score: priorityScore,
      target_band: priorityBand,
      founder_priority_score: priorityScore,
      founder_priority_band: priorityBand,
      next_best_action: row.next_best_action,
      last_contacted_at: row.last_contacted_at,
      next_followup_at: row.next_followup_at,
      last_researched_at: row.last_researched_at,
      score_breakdown:
        typeof row.founder_priority_breakdown === 'object'
          ? row.founder_priority_breakdown
          : JSON.parse(row.founder_priority_breakdown || row.score_breakdown || '{}'),
      calculated_at: row.calculated_at,
    };
  });

  return { targets, count: targets.length };
}

module.exports = {
  getTopBuilderTargets,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
