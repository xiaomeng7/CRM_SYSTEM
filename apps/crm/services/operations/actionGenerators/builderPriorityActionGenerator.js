/**
 * Suggested actions for builder_priority events (PR8E.1).
 */

function generateBuilderPriorityActions(event) {
  const payload = event.payload || {};
  const recommended = payload.next_best_action || 'Call Builder';

  const actions = [
    {
      action_type: 'builder_call',
      title: 'Call Builder',
      description: 'Direct founder call — highest impact for priority builders.',
      priority: recommended === 'Call Builder' ? 1 : 2,
      payload: {
        prospect_id: payload.prospect_id || null,
        company_name: payload.company_name || null,
        recommended_action: recommended,
      },
    },
    {
      action_type: 'builder_meeting',
      title: 'Arrange Meeting',
      description: 'Propose a short meeting to explore partnership fit.',
      priority: recommended === 'Arrange Meeting' ? 1 : 3,
      payload: {
        prospect_id: payload.prospect_id || null,
        relationship_strength: payload.relationship_strength || null,
      },
    },
    {
      action_type: 'builder_review_profile',
      title: 'Review Research Profile',
      description: 'Review fit score, signals and founder snapshot before contact.',
      priority: 4,
      payload: {
        prospect_id: payload.prospect_id || null,
        founder_priority_score: payload.founder_priority_score ?? null,
        founder_priority_band: payload.founder_priority_band || null,
      },
    },
    {
      action_type: 'builder_update_relationship',
      title: 'Update Relationship Status',
      description: 'Update relationship strength, timing and founder notes after contact.',
      priority: 5,
      payload: {
        prospect_id: payload.prospect_id || null,
        relationship_strength: payload.relationship_strength || null,
        timing_status: payload.timing_status || null,
      },
    },
  ];

  return actions.sort((a, b) => a.priority - b.priority);
}

module.exports = { generateBuilderPriorityActions };
