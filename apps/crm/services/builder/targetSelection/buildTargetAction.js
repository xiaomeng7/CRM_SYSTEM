/**
 * Recommended founder actions V2 (PR8E.1).
 */

const { daysSinceContact } = require('./actionHelpers');

const STRONG_RELATIONSHIPS = new Set(['known', 'worked_together', 'trusted_partner']);
const COLD_RELATIONSHIPS = new Set(['unknown', 'cold']);

function buildTargetAction(prospect, profile, scoreResult) {
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

module.exports = { buildTargetAction, STRONG_RELATIONSHIPS, COLD_RELATIONSHIPS };
