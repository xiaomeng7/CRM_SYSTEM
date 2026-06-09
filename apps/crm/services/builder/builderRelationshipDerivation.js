/**
 * Derive internal CRM fields from Founder-facing relationship inputs (PR8F).
 */

const { opportunityFromFitScore } = require('./inferProspectFieldsFromResearch');

const FOUNDER_BUILDER_STATUSES = ['prospect', 'active_partner', 'strategic_partner'];

const FOUNDER_RELATIONSHIP_STRENGTHS = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'met_once', label: 'Met' },
  { value: 'worked_together', label: 'Worked Together' },
  { value: 'trusted_partner', label: 'Trusted Partner' },
];

function normalizeRelationshipStrength(value) {
  if (value == null || value === '') return 'unknown';
  const v = String(value).trim();
  if (v === 'met' || v === 'known') return 'met_once';
  return v;
}

function deriveRelationshipStage(builderStatus, relationshipStrength, researchStatus) {
  const status = builderStatus || 'prospect';
  const strength = normalizeRelationshipStrength(relationshipStrength);

  if (status === 'strategic_partner' || status === 'active_partner') {
    return 'working_together';
  }
  if (status === 'inactive_partner') {
    return 'inactive';
  }
  if (strength === 'trusted_partner' || strength === 'worked_together') {
    return 'qualified';
  }
  if (strength === 'met_once') {
    return 'contacted';
  }
  if (researchStatus === 'researched') {
    return 'qualified';
  }
  if (researchStatus === 'researching') {
    return 'researching';
  }
  return 'discovered';
}

function deriveOpportunityPotential(builderStatus, fitPriority, estimatedFitScore) {
  const status = builderStatus || 'prospect';
  if (status === 'strategic_partner') return 'strategic';
  if (status === 'active_partner') return 'high';
  if (estimatedFitScore != null) {
    return opportunityFromFitScore(estimatedFitScore);
  }
  if (fitPriority === 'high') return 'high';
  if (fitPriority === 'medium') return 'medium';
  if (fitPriority === 'low') return 'low';
  return 'unknown';
}

/**
 * Merge derived internal fields into a prospect update payload.
 * @param {object} updates — normalized founder-facing fields
 * @param {object} [context]
 */
function applyRelationshipDerivation(updates, context = {}, options = {}) {
  const out = { ...updates };
  if (options.derivedFromRelationshipLevel) {
    return out;
  }

  const builderStatus = updates.builder_status ?? context.builder_status ?? 'prospect';
  const strength = normalizeRelationshipStrength(
    updates.relationship_strength ?? context.relationship_strength
  );
  const researchStatus = updates.research_status ?? context.research_status ?? 'not_started';
  const fitPriority = updates.fit_priority ?? context.fit_priority ?? 'unknown';

  if (updates.relationship_strength !== undefined) {
    out.relationship_strength = strength;
  }

  if (
    updates.relationship_stage === undefined &&
    (updates.builder_status !== undefined ||
      updates.relationship_strength !== undefined ||
      updates.research_status !== undefined)
  ) {
    out.relationship_stage = deriveRelationshipStage(builderStatus, strength, researchStatus);
  }

  if (
    updates.opportunity_potential === undefined &&
    (updates.builder_status !== undefined ||
      updates.fit_priority !== undefined ||
      updates.relationship_strength !== undefined)
  ) {
    out.opportunity_potential = deriveOpportunityPotential(
      builderStatus,
      fitPriority,
      context.estimated_fit_score
    );
  }

  return out;
}

module.exports = {
  FOUNDER_BUILDER_STATUSES,
  FOUNDER_RELATIONSHIP_STRENGTHS,
  normalizeRelationshipStrength,
  deriveRelationshipStage,
  deriveOpportunityPotential,
  applyRelationshipDerivation,
};
