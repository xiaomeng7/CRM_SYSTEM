/**
 * Deterministic suggested actions for builder_followup events (PR8B).
 * Recommendations only — no email, SMS, or task creation.
 */

function generateBuilderFollowupActions(event) {
  const payload = event.payload || {};
  return [
    {
      action_type: 'builder_call',
      title: 'Call builder',
      description: 'Make a direct phone call to re-open the conversation.',
      priority: 1,
      payload: {
        prospect_id: payload.prospect_id || null,
        company_name: payload.company_name || null,
        reason: payload.reason || null,
      },
    },
    {
      action_type: 'builder_email_draft',
      title: 'Send introduction / follow-up email draft',
      description:
        'Prepare a personalised email using the builder profile and website.',
      priority: 2,
      payload: {
        prospect_id: payload.prospect_id || null,
        company_name: payload.company_name || null,
        website: payload.website || null,
      },
    },
    {
      action_type: 'builder_review_profile',
      title: 'Review builder profile',
      description: 'Check website, project type and fit before contact.',
      priority: 3,
      payload: {
        prospect_id: payload.prospect_id || null,
        builder_type: payload.builder_type || null,
        project_focus: payload.project_focus || null,
        fit_priority: payload.fit_priority || null,
      },
    },
    {
      action_type: 'builder_set_followup',
      title: 'Set next follow-up date',
      description: 'Schedule the next relationship action.',
      priority: 4,
      payload: {
        prospect_id: payload.prospect_id || null,
        next_followup_at: payload.next_followup_at || null,
        relationship_stage: payload.relationship_stage || null,
      },
    },
  ];
}

module.exports = { generateBuilderFollowupActions };
