/**
 * Deterministic suggested actions for builder_target events (PR8E).
 */

function generateBuilderTargetActions(event) {
  const payload = event.payload || {};
  const action = payload.next_best_action || 'Review Builder';

  return [
    {
      action_type: 'builder_call',
      title: 'Call Builder',
      description: 'Make a direct phone call — highest-impact founder action for top targets.',
      priority: 1,
      payload: {
        prospect_id: payload.prospect_id || null,
        company_name: payload.company_name || null,
        suggested_action: action,
      },
    },
    {
      action_type: 'builder_email_draft',
      title: 'Send Introduction',
      description: 'Prepare a personalised introduction email using the research profile.',
      priority: 2,
      payload: {
        prospect_id: payload.prospect_id || null,
        company_name: payload.company_name || null,
      },
    },
    {
      action_type: 'builder_meeting',
      title: 'Arrange Meeting',
      description: 'Propose a short meeting to explore partnership fit.',
      priority: 3,
      payload: {
        prospect_id: payload.prospect_id || null,
        relationship_stage: payload.relationship_stage || null,
      },
    },
    {
      action_type: 'builder_review_profile',
      title: 'Review Research Profile',
      description: 'Review website research, fit score and signals before contact.',
      priority: 4,
      payload: {
        prospect_id: payload.prospect_id || null,
        target_score: payload.target_score ?? null,
        target_band: payload.target_band || null,
      },
    },
  ];
}

module.exports = { generateBuilderTargetActions };
