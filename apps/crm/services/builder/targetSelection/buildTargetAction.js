/**
 * Recommended founder actions V2/V3 (PR8E.1 / PR8E.3).
 */

const { daysSinceContact } = require('./actionHelpers');
const { isPartnerBuilderStatus } = require('./calculatePartnerValueScore');

const STRONG_RELATIONSHIPS = new Set(['known', 'worked_together', 'trusted_partner']);
const COLD_RELATIONSHIPS = new Set(['unknown', 'cold']);

function buildStrategicPartnerAction(prospect, timing, daysIdle) {
  if (timing === 'active_project') {
    return 'Discuss Upcoming Projects';
  }
  if (timing === 'quoting_projects') {
    return 'Request Project Forecast';
  }
  if (daysIdle != null && daysIdle > 60) {
    return 'Arrange Quarterly Meeting';
  }
  if (prospect.opportunity_potential === 'strategic') {
    return 'Present Smart Home Offering';
  }
  return 'Arrange Quarterly Meeting';
}

function buildActivePartnerAction(prospect, timing, daysIdle) {
  if (timing === 'quoting_projects' || timing === 'active_project') {
    return 'Check Upcoming Pipeline';
  }
  if (daysIdle != null && daysIdle > 45) {
    return 'Reconnect';
  }
  if (timing === 'growth_mode') {
    return 'Share New Capability';
  }
  return 'Request Project Forecast';
}

function buildProspectAction(prospect, profile, scoreResult) {
  const stage = prospect.relationship_stage != null ? String(prospect.relationship_stage).trim() : '';
  const band =
    scoreResult?.founder_priority_band || scoreResult?.target_band || 'D';
  const strength = prospect.relationship_strength || 'unknown';
  const timing = prospect.timing_status || 'unknown';
  const fitScore = profile?.estimated_fit_score != null ? Number(profile.estimated_fit_score) : null;
  const daysIdle = daysSinceContact(prospect.last_contacted_at);

  if (stage === 'inactive' || stage === 'not_fit') {
    return 'Not a Priority';
  }

  if (timing === 'quoting_projects') {
    return 'Request Upcoming Tender Opportunities';
  }

  if (strength === 'worked_together' && daysIdle != null && daysIdle > 60) {
    return 'Reconnect';
  }

  if (stage === 'working_together') {
    return 'Maintain Relationship';
  }
  if (stage === 'meeting_booked') {
    return 'Prepare Meeting';
  }
  if (stage === 'proposal_sent') {
    return 'Follow Up Proposal';
  }

  if (band === 'A' && STRONG_RELATIONSHIPS.has(strength)) {
    return 'Arrange Meeting';
  }

  if (band === 'B' && COLD_RELATIONSHIPS.has(strength)) {
    return 'Call Builder';
  }

  if (band === 'C' && COLD_RELATIONSHIPS.has(strength)) {
    return 'Send Introduction Email';
  }

  if (band === 'A') {
    return 'Call Builder';
  }

  if (
    (stage === 'discovered' || stage === 'researching' || stage === 'qualified') &&
    fitScore != null &&
    fitScore >= 75 &&
    !prospect.last_contacted_at
  ) {
    return 'Send Introduction Email';
  }

  if (stage === 'qualified' || stage === 'contacted') {
    return 'Call Builder';
  }

  if (stage === 'discovered' || stage === 'researching') {
    return prospect.research_status === 'researched' ? 'Call Builder' : 'Research Further';
  }

  return 'Review Builder';
}

function buildTargetAction(prospect, profile, scoreResult) {
  const builderStatus = prospect.builder_status || 'prospect';
  const timing = prospect.timing_status || 'unknown';
  const daysIdle = daysSinceContact(prospect.last_contacted_at);

  if (builderStatus === 'inactive_partner') {
    if (daysIdle != null && daysIdle > 90) {
      return 'Reconnect';
    }
    return 'Maintain Relationship';
  }

  if (builderStatus === 'strategic_partner') {
    return buildStrategicPartnerAction(prospect, timing, daysIdle);
  }

  if (builderStatus === 'active_partner') {
    return buildActivePartnerAction(prospect, timing, daysIdle);
  }

  return buildProspectAction(prospect, profile, scoreResult);
}

module.exports = {
  buildTargetAction,
  buildStrategicPartnerAction,
  buildActivePartnerAction,
  buildProspectAction,
  STRONG_RELATIONSHIPS,
  COLD_RELATIONSHIPS,
};
