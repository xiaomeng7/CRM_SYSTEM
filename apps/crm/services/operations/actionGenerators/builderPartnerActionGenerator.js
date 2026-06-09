/**
 * Suggested actions for builder_partner events (PR8E.3).
 */

function generateBuilderPartnerActions(event) {
  const payload = event.payload || {};
  const recommended = payload.next_best_action || 'Arrange Quarterly Meeting';

  return [
    {
      action_type: 'builder_meeting',
      title: 'Arrange Meeting',
      description: 'Schedule a relationship meeting with this strategic partner.',
      priority: recommended.includes('Meeting') ? 1 : 2,
      payload: {
        prospect_id: payload.prospect_id || null,
        company_name: payload.company_name || null,
        recommended_action: recommended,
      },
    },
    {
      action_type: 'builder_call',
      title: 'Call Builder',
      description: 'Direct call to maintain strategic partner relationship.',
      priority: 2,
      payload: { prospect_id: payload.prospect_id || null },
    },
    {
      action_type: 'builder_review_profile',
      title: 'Review Research Profile',
      description: 'Review partner profile, timing and pipeline before contact.',
      priority: 3,
      payload: {
        prospect_id: payload.prospect_id || null,
        partner_value_score: payload.partner_value_score ?? null,
      },
    },
    {
      action_type: 'builder_update_relationship',
      title: 'Update Relationship Status',
      description: 'Update builder status, timing and founder notes after contact.',
      priority: 4,
      payload: {
        prospect_id: payload.prospect_id || null,
        builder_status: payload.builder_status || null,
      },
    },
  ].sort((a, b) => a.priority - b.priority);
}

module.exports = { generateBuilderPartnerActions };
