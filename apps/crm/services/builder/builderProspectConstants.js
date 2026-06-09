/**
 * Builder prospect enums and field definitions (PR8A).
 */

const PROSPECT_TYPE_BUILDER = 'builder';

const BUILDER_TYPES = [
  'luxury_residential',
  'custom_homes',
  'architectural_homes',
  'townhouse_developer',
  'volume_builder',
  'commercial_builder',
  'unknown',
];

const PROJECT_FOCUS = [
  'architectural_new_build',
  'custom_home',
  'luxury_renovation',
  'townhouse',
  'small_developer',
  'unknown',
];

const FIT_PRIORITIES = ['high', 'medium', 'low', 'unknown'];

const RESEARCH_STATUSES = [
  'not_started',
  'researching',
  'researched',
  'needs_update',
];

const RELATIONSHIP_STAGES = [
  'discovered',
  'researching',
  'qualified',
  'contacted',
  'meeting_booked',
  'proposal_sent',
  'working_together',
  'inactive',
  'not_fit',
];

const BUILDER_CREATE_FIELDS = [
  'company_name',
  'contact_name',
  'phone',
  'email',
  'address',
  'suburb',
  'website',
  'notes',
  'source',
  'source_detail',
  'builder_type',
  'project_focus',
  'target_suburbs',
  'fit_priority',
  'research_status',
  'relationship_stage',
  'decision_maker_name',
  'decision_maker_role',
  'qualification_notes',
  'next_followup_at',
];

const BUILDER_UPDATE_FIELDS = [
  ...BUILDER_CREATE_FIELDS.filter((f) => f !== 'company_name'),
  'company_name',
  'last_contacted_at',
];

/** Future operational_events entity_type for builder prospects */
const BUILDER_ENTITY_TYPE = 'b2b_prospect';

module.exports = {
  PROSPECT_TYPE_BUILDER,
  BUILDER_TYPES,
  PROJECT_FOCUS,
  FIT_PRIORITIES,
  RESEARCH_STATUSES,
  RELATIONSHIP_STAGES,
  BUILDER_CREATE_FIELDS,
  BUILDER_UPDATE_FIELDS,
  BUILDER_ENTITY_TYPE,
};
