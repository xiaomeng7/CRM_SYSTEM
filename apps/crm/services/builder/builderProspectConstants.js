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

const RELATIONSHIP_STRENGTHS = [
  'unknown',
  'cold',
  'met_once',
  'known',
  'worked_together',
  'trusted_partner',
];

const OPPORTUNITY_POTENTIALS = ['unknown', 'low', 'medium', 'high', 'strategic'];

const BUILDER_STATUSES = [
  'prospect',
  'active_partner',
  'strategic_partner',
  'inactive_partner',
];

const PIPELINE_STAGES = [
  'target',
  'contact_discovery',
  'contact_ready',
  'relationship_building',
  'opportunity',
  'active_builder',
  'strategic_partner',
  'inactive',
];

const TIMING_STATUSES = [
  'unknown',
  'growth_mode',
  'quoting_projects',
  'tendering',
  'active_project',
  'slow_period',
];

/** Founder-facing opportunity options (PR8G.2) — excludes unknown. */
const FOUNDER_OPPORTUNITY_POTENTIALS = ['low', 'medium', 'high', 'strategic'];

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
  'relationship_strength',
  'opportunity_potential',
  'timing_status',
  'founder_notes',
  'builder_status',
  'pipeline_stage',
];

const BUILDER_UPDATE_FIELDS = [
  ...BUILDER_CREATE_FIELDS.filter((f) => f !== 'company_name'),
  'company_name',
  'last_contacted_at',
];

/** Future operational_events entity_type for builder prospects */
const BUILDER_ENTITY_TYPE = 'b2b_prospect';

/** Safe defaults when founder adds a builder (PR8F). */
const DISCOVERY_CREATE_DEFAULTS = {
  builder_status: 'prospect',
  relationship_strength: 'unknown',
  opportunity_potential: 'medium',
  timing_status: 'unknown',
  relationship_stage: 'discovered',
  research_status: 'not_started',
};

module.exports = {
  PROSPECT_TYPE_BUILDER,
  BUILDER_TYPES,
  PROJECT_FOCUS,
  FIT_PRIORITIES,
  RESEARCH_STATUSES,
  RELATIONSHIP_STAGES,
  RELATIONSHIP_STRENGTHS,
  OPPORTUNITY_POTENTIALS,
  TIMING_STATUSES,
  BUILDER_STATUSES,
  PIPELINE_STAGES,
  FOUNDER_OPPORTUNITY_POTENTIALS,
  BUILDER_CREATE_FIELDS,
  BUILDER_UPDATE_FIELDS,
  BUILDER_ENTITY_TYPE,
  DISCOVERY_CREATE_DEFAULTS,
};
