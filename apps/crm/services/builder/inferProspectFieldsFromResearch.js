/**
 * Map website research analysis → b2b_prospects fields (PR8F).
 */

function opportunityFromFitScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'unknown';
  if (n >= 80) return 'strategic';
  if (n >= 65) return 'high';
  if (n >= 45) return 'medium';
  return 'low';
}

function builderTypeFromAnalysis(analysis) {
  const focus = String(analysis.builder_focus || '').toLowerCase();
  const detected = analysis.detected || {};
  if (focus.includes('architectural')) return 'architectural_homes';
  if (focus.includes('custom')) return 'custom_homes';
  if (focus.includes('luxury')) return 'luxury_residential';
  if (focus.includes('townhouse')) return 'townhouse_developer';
  if (focus.includes('volume')) return 'volume_builder';
  if (focus.includes('commercial') || detected.commercial_only) return 'commercial_builder';
  return 'unknown';
}

function projectFocusFromAnalysis(analysis) {
  const types = analysis.project_types || [];
  const first = types.find((t) => t && t !== 'unknown');
  if (first && ['architectural_new_build', 'custom_home', 'luxury_renovation', 'townhouse', 'small_developer'].includes(first)) {
    return first;
  }
  const focus = String(analysis.builder_focus || '').toLowerCase();
  if (focus.includes('architectural')) return 'architectural_new_build';
  if (focus.includes('custom') || focus.includes('luxury')) return 'custom_home';
  if (focus.includes('townhouse')) return 'townhouse';
  if (focus.includes('renovation')) return 'luxury_renovation';
  return 'unknown';
}

function targetSuburbsFromAnalysis(analysis) {
  const suburbs = analysis.target_suburbs || [];
  if (!suburbs.length) return null;
  return suburbs.join(', ');
}

/**
 * @param {object} analysis — output from analyzeBuilderWebsite
 */
function inferProspectFieldsFromResearch(analysis) {
  const fit_priority = analysis.fit_priority || 'unknown';
  const score = analysis.estimated_fit_score;

  return {
    research_status: 'researched',
    fit_priority,
    builder_type: builderTypeFromAnalysis(analysis),
    project_focus: projectFocusFromAnalysis(analysis),
    target_suburbs: targetSuburbsFromAnalysis(analysis),
    opportunity_potential: opportunityFromFitScore(score),
    relationship_stage: 'qualified',
  };
}

module.exports = {
  inferProspectFieldsFromResearch,
  opportunityFromFitScore,
  builderTypeFromAnalysis,
  projectFocusFromAnalysis,
};
