/**
 * Active partners — builder_status = active_partner (PR8E.3).
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

async function getActivePartners(filters = {}, options = {}) {
  const db = options.db || pool;
  const limit = parseLimit(filters.limit);

  const r = await db.query(
    `SELECT
       p.id AS prospect_id,
       p.company_name,
       p.website,
       p.suburb,
       p.builder_status,
       p.relationship_strength,
       p.opportunity_potential,
       p.timing_status,
       p.last_contacted_at,
       bp.estimated_fit_score,
       ts.partner_value_score,
       ts.partner_value_band,
       ts.next_best_action
     FROM b2b_prospects p
     LEFT JOIN builder_profiles bp ON bp.prospect_id = p.id
     LEFT JOIN builder_target_scores ts ON ts.prospect_id = p.id
     WHERE p.prospect_type = $1
       AND p.builder_status = 'active_partner'
       AND p.relationship_stage NOT IN ('inactive', 'not_fit')
     ORDER BY
       ts.partner_value_score DESC NULLS LAST,
       p.last_contacted_at ASC NULLS FIRST,
       p.company_name ASC
     LIMIT $2`,
    [PROSPECT_TYPE_BUILDER, limit]
  );

  const partners = r.rows.map((row, index) => ({
    rank: index + 1,
    prospect_id: row.prospect_id,
    company_name: row.company_name,
    website: row.website,
    suburb: row.suburb,
    builder_status: row.builder_status,
    relationship_strength: row.relationship_strength,
    opportunity_potential: row.opportunity_potential,
    timing_status: row.timing_status,
    estimated_fit_score: row.estimated_fit_score != null ? Number(row.estimated_fit_score) : null,
    partner_value_score:
      row.partner_value_score != null ? Number(row.partner_value_score) : null,
    partner_value_band: row.partner_value_band || null,
    next_best_action: row.next_best_action || null,
    last_contacted_at: row.last_contacted_at,
  }));

  return { partners, count: partners.length };
}

module.exports = {
  getActivePartners,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
