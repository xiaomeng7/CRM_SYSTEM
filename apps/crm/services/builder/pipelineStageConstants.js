/**
 * Builder development pipeline stages (PR10A).
 */

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

const PIPELINE_STAGE_ORDER = [
  'target',
  'contact_discovery',
  'contact_ready',
  'relationship_building',
  'opportunity',
  'active_builder',
  'strategic_partner',
];

const PIPELINE_STAGE_LABELS = {
  target: 'Target',
  contact_discovery: 'Contact Discovery',
  contact_ready: 'Ready To Contact',
  relationship_building: 'Relationship Building',
  opportunity: 'Opportunity',
  active_builder: 'Active Builder',
  strategic_partner: 'Strategic Partner',
  inactive: 'Inactive',
};

const PIPELINE_NEXT_ACTIONS = {
  target: 'Find Contact',
  contact_discovery: 'Find Contact',
  contact_ready: 'Call Builder',
  relationship_building: 'Follow Up',
  opportunity: 'Submit Proposal',
  active_builder: 'Relationship Review',
  strategic_partner: 'Quarterly Check-In',
  inactive: 'Review Inactive Builder',
};

const PIPELINE_UI_SECTIONS = [
  { id: 'target', title: 'Target Builders', stages: ['target'] },
  { id: 'contact_discovery', title: 'Contact Discovery', stages: ['contact_discovery'] },
  { id: 'contact_ready', title: 'Ready To Contact', stages: ['contact_ready'] },
  { id: 'relationship_building', title: 'Relationship Building', stages: ['relationship_building'] },
  { id: 'opportunity', title: 'Opportunities', stages: ['opportunity'] },
  { id: 'active_builder', title: 'Active Builders', stages: ['active_builder'] },
  { id: 'strategic_partner', title: 'Strategic Partners', stages: ['strategic_partner'] },
];

const PIPELINE_SUMMARY_GROUPS = [
  { id: 'target', label: 'Target', stages: ['target', 'contact_discovery'] },
  { id: 'contact_ready', label: 'Contact Ready', stages: ['contact_ready'] },
  { id: 'relationship', label: 'Relationship', stages: ['relationship_building'] },
  { id: 'opportunities', label: 'Opportunities', stages: ['opportunity'] },
  { id: 'active', label: 'Active', stages: ['active_builder'] },
  { id: 'strategic', label: 'Strategic', stages: ['strategic_partner'] },
];

module.exports = {
  PIPELINE_STAGES,
  PIPELINE_STAGE_ORDER,
  PIPELINE_STAGE_LABELS,
  PIPELINE_NEXT_ACTIONS,
  PIPELINE_UI_SECTIONS,
  PIPELINE_SUMMARY_GROUPS,
};
