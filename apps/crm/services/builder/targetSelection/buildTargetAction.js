/**
 * Deterministic next-best-action for builder targets (PR8E).
 */

function buildTargetAction(prospect, profile, scoreResult) {
  const stage = prospect.relationship_stage != null ? String(prospect.relationship_stage).trim() : '';
  const fitScore = profile?.estimated_fit_score != null ? Number(profile.estimated_fit_score) : null;
  const breakdown = scoreResult?.score_breakdown?.components || [];
  const followup = breakdown.find((c) => c.component === 'followup_urgency');
  const followupOverdue = (followup?.points || 0) >= 20;

  if (stage === 'working_together') {
    return 'Maintain Relationship';
  }
  if (stage === 'meeting_booked') {
    return 'Prepare Meeting';
  }
  if (stage === 'proposal_sent') {
    return 'Follow Up Proposal';
  }
  if (stage === 'qualified' && followupOverdue) {
    return 'Call Builder';
  }
  if (stage === 'contacted' && followupOverdue) {
    return 'Call Builder';
  }
  if (
    (stage === 'discovered' || stage === 'researching' || stage === 'qualified') &&
    fitScore != null &&
    fitScore >= 75 &&
    !prospect.last_contacted_at
  ) {
    return 'Send Introduction';
  }
  if (
    prospect.research_status === 'researched' &&
    !prospect.next_followup_at &&
    stage !== 'inactive' &&
    stage !== 'not_fit'
  ) {
    return 'Schedule Follow-up';
  }
  if (stage === 'qualified') {
    return 'Call Builder';
  }
  if (stage === 'contacted') {
    return 'Call Builder';
  }
  if (stage === 'discovered' || stage === 'researching') {
    return 'Run Research';
  }
  if (stage === 'inactive' || stage === 'not_fit') {
    return 'No Action';
  }
  return 'Review Builder';
}

module.exports = { buildTargetAction };
