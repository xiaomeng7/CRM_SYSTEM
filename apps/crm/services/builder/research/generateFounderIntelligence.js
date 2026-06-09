/**
 * Deterministic founder decision-support blocks (PR8D.1).
 */

function fitBandFromScore(score) {
  if (score == null || !Number.isFinite(Number(score))) return '—';
  const n = Number(score);
  if (n >= 90) return 'A';
  if (n >= 75) return 'B';
  if (n >= 50) return 'C';
  return 'D';
}

function generateWhyBhtFit(analysis) {
  const bullets = [];
  const detected = analysis.detected || {};

  if (analysis.architectural_fit === 'high') bullets.push('Architectural projects');
  if (analysis.luxury_fit === 'high') bullets.push('Premium residential positioning');
  if (detected.custom_homes) bullets.push('Custom home builder focus');
  if (detected.architect_mention) bullets.push('Design-conscious clients');
  if (analysis.smart_home_fit === 'high' || analysis.smart_home_fit === 'medium') {
    bullets.push('Smart-home upgrade potential');
  }
  if (detected.luxury_premium) bullets.push('Luxury finish standards');
  if (detected.project_gallery) bullets.push('Documented project portfolio');
  if (detected.renovations) bullets.push('Renovation and extension work');

  return [...new Set(bullets)].slice(0, 5);
}

function generateOpportunitySummary(analysis) {
  const bullets = [];
  const detected = analysis.detected || {};

  if (detected.smart_home || analysis.smart_home_fit === 'high') {
    bullets.push('Smart home integration');
  }
  if (detected.architect_mention || analysis.architectural_fit === 'high') {
    bullets.push('Architectural lighting design');
  }
  bullets.push('Premium electrical partnership');
  if (detected.renovations) bullets.push('Renovation electrical upgrades');
  if (analysis.luxury_fit === 'high') bullets.push('Luxury specification support');
  if (detected.luxury_premium) bullets.push('Lighting design for premium finishes');

  return [...new Set(bullets)].slice(0, 5);
}

function deriveRecommendedFounderAction(analysis, prospectContext = {}) {
  const score =
    analysis.estimated_fit_score != null ? Number(analysis.estimated_fit_score) : null;
  const stage = String(prospectContext.relationship_stage || 'discovered').trim();
  const researchStatus = String(prospectContext.research_status || 'not_started').trim();
  const hasProfile = Boolean(analysis.profile_summary && analysis.profile_summary.length > 10);

  if (stage === 'inactive' || stage === 'not_fit') return 'Not a Priority';
  if (score != null && score < 40) return 'Not a Priority';

  if (stage === 'working_together') return 'Maintain Relationship';
  if (stage === 'meeting_booked') return 'Arrange Coffee Meeting';
  if (stage === 'proposal_sent') return 'Follow Up Proposal';

  if (researchStatus !== 'researched' || !hasProfile) return 'Research Further';

  if (stage === 'contacted' || stage === 'qualified') return 'Call Builder';

  if ((stage === 'discovered' || stage === 'researching') && score != null) {
    if (score >= 85) return 'Call Builder';
    if (score >= 75) return 'Send Introduction Email';
    if (score >= 50) return 'Research Further';
    return 'Not a Priority';
  }

  if (score != null && score >= 75) return 'Send Introduction Email';
  if (score != null && score >= 50) return 'Research Further';
  return 'Review Builder';
}

function generateFounderSummary(companyName, analysis, whyBhtFit, opportunity) {
  const name = companyName || 'This builder';
  const score = analysis.estimated_fit_score;
  const band = fitBandFromScore(score);
  const focus =
    analysis.builder_focus && analysis.builder_focus !== 'unknown'
      ? analysis.builder_focus
      : 'residential building';
  const fitReason = whyBhtFit[0] ? whyBhtFit[0].toLowerCase() : 'limited public signals';
  const opp = opportunity[0] ? opportunity[0].toLowerCase() : 'partnership review needed';

  return `${name} is a ${focus} candidate (Band ${band}, ${score}/100). Key fit: ${fitReason}. Primary opportunity: ${opp}.`;
}

function generateFounderIntelligence(analysis, prospectContext = {}) {
  const why_bht_fit = generateWhyBhtFit(analysis);
  const opportunity_summary = generateOpportunitySummary(analysis);
  const founder_summary = generateFounderSummary(
    prospectContext.company_name,
    analysis,
    why_bht_fit,
    opportunity_summary
  );
  const recommended_founder_action = deriveRecommendedFounderAction(analysis, prospectContext);
  const fit_band = fitBandFromScore(analysis.estimated_fit_score);

  return {
    founder_summary,
    why_bht_fit,
    opportunity_summary,
    recommended_founder_action,
    fit_band,
  };
}

module.exports = {
  fitBandFromScore,
  generateWhyBhtFit,
  generateOpportunitySummary,
  deriveRecommendedFounderAction,
  generateFounderSummary,
  generateFounderIntelligence,
};
