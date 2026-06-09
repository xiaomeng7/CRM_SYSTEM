/**
 * Partner value score (PR8E.3).
 * 40% Relationship · 25% Opportunity · 20% Timing · 15% Fit
 */

const {
  RELATIONSHIP_STRENGTH_POINTS,
  TIMING_POINTS,
} = require('./calculateFounderPriorityScore');

const OPPORTUNITY_POINTS = {
  unknown: 0,
  low: 5,
  medium: 12,
  high: 20,
  strategic: 25,
};

const PARTNER_VALUE_BANDS = [
  { min: 85, band: 'A' },
  { min: 70, band: 'B' },
  { min: 55, band: 'C' },
  { min: 0, band: 'D' },
];

const PARTNER_STATUSES = new Set(['active_partner', 'strategic_partner', 'inactive_partner']);
const PARTNER_SCORE_STATUSES = new Set(['active_partner', 'strategic_partner']);

function clampScore(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function assignPartnerValueBand(score) {
  for (const row of PARTNER_VALUE_BANDS) {
    if (score >= row.min) return row.band;
  }
  return 'D';
}

function isPartnerBuilderStatus(status) {
  return PARTNER_SCORE_STATUSES.has(String(status || 'prospect').trim());
}

function isProspectBuilderStatus(status) {
  const s = String(status || 'prospect').trim();
  return s === 'prospect' || s === 'inactive_partner';
}

function relationshipComponent(strength) {
  const key = strength != null ? String(strength).trim() : 'unknown';
  const raw = RELATIONSHIP_STRENGTH_POINTS[key] ?? 0;
  const points = (raw / 50) * 40;
  return {
    component: 'relationship',
    weight: '40%',
    points: Math.round(points * 10) / 10,
    max_points: 40,
    detail: { relationship_strength: key, raw_points: raw },
  };
}

function opportunityComponent(opportunityPotential) {
  const key = opportunityPotential != null ? String(opportunityPotential).trim() : 'unknown';
  const raw = OPPORTUNITY_POINTS[key] ?? 0;
  const points = (raw / 25) * 25;
  return {
    component: 'opportunity',
    weight: '25%',
    points: Math.round(points * 10) / 10,
    max_points: 25,
    detail: { opportunity_potential: key, raw_points: raw },
  };
}

function timingComponent(timingStatus) {
  const key = timingStatus != null ? String(timingStatus).trim() : 'unknown';
  const raw = TIMING_POINTS[key] ?? 0;
  const points = (raw / 20) * 20;
  return {
    component: 'timing',
    weight: '20%',
    points: Math.round(points * 10) / 10,
    max_points: 20,
    detail: { timing_status: key, raw_points: raw },
  };
}

function fitComponent(estimatedFitScore) {
  const fit = Number(estimatedFitScore);
  const raw = Number.isFinite(fit) ? fit : 0;
  const points = raw * 0.15;
  return {
    component: 'fit',
    weight: '15%',
    points: Math.round(points * 10) / 10,
    max_points: 15,
    detail: { estimated_fit_score: Number.isFinite(fit) ? fit : null },
  };
}

function applyStrategicPartnerFloor(prospect, score, band) {
  if (prospect.builder_status !== 'strategic_partner') {
    return { partner_value_score: score, partner_value_band: band };
  }
  const flooredScore = Math.max(score, 70);
  const flooredBand = assignPartnerValueBand(flooredScore);
  const finalBand = flooredBand === 'C' || flooredBand === 'D' ? 'B' : flooredBand;
  return {
    partner_value_score: Math.max(flooredScore, 70),
    partner_value_band: finalBand,
    floor_applied: score < 70 || band === 'C' || band === 'D',
  };
}

/**
 * @param {object} input
 * @param {object} input.prospect
 * @param {object|null} input.profile
 * @param {Date} [input.now]
 */
function calculatePartnerValueScore(input) {
  const prospect = input.prospect || {};
  const profile = input.profile || null;
  const now = input.now || new Date();

  const components = [
    relationshipComponent(prospect.relationship_strength),
    opportunityComponent(prospect.opportunity_potential),
    timingComponent(prospect.timing_status),
    fitComponent(profile?.estimated_fit_score),
  ];

  const total = components.reduce((sum, c) => sum + c.points, 0);
  let partner_value_score = clampScore(total);
  let partner_value_band = assignPartnerValueBand(partner_value_score);

  const floor = applyStrategicPartnerFloor(prospect, partner_value_score, partner_value_band);
  partner_value_score = floor.partner_value_score;
  partner_value_band = floor.partner_value_band;

  const partner_value_breakdown = {
    components,
    total_raw: Math.round(total * 10) / 10,
    partner_value_score,
    partner_value_band,
    floor_applied: floor.floor_applied || false,
    calculated_at: now.toISOString(),
  };

  return {
    partner_value_score,
    partner_value_band,
    partner_value_breakdown,
    score_kind: 'partner_value',
  };
}

module.exports = {
  calculatePartnerValueScore,
  assignPartnerValueBand,
  isPartnerBuilderStatus,
  isProspectBuilderStatus,
  applyStrategicPartnerFloor,
  OPPORTUNITY_POINTS,
  PARTNER_VALUE_BANDS,
  PARTNER_STATUSES,
};
