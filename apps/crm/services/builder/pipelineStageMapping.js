/**
 * pipeline_stage ↔ legacy builder CRM fields (PR10A).
 */

const {
  PIPELINE_STAGES,
  PIPELINE_STAGE_ORDER,
  PIPELINE_NEXT_ACTIONS,
} = require('./pipelineStageConstants');

const STAGE_TO_FIELDS = {
  target: {
    builder_status: 'prospect',
    relationship_stage: 'qualified',
    relationship_strength: 'unknown',
  },
  contact_discovery: {
    builder_status: 'prospect',
    relationship_stage: 'researching',
    relationship_strength: 'unknown',
  },
  contact_ready: {
    builder_status: 'prospect',
    relationship_stage: 'qualified',
    relationship_strength: 'cold',
  },
  relationship_building: {
    builder_status: 'prospect',
    relationship_stage: 'contacted',
    relationship_strength: 'known',
  },
  opportunity: {
    builder_status: 'prospect',
    relationship_stage: 'proposal_sent',
    relationship_strength: 'known',
  },
  active_builder: {
    builder_status: 'active_partner',
    relationship_stage: 'working_together',
    relationship_strength: 'worked_together',
  },
  strategic_partner: {
    builder_status: 'strategic_partner',
    relationship_stage: 'working_together',
    relationship_strength: 'trusted_partner',
  },
  inactive: {
    builder_status: 'inactive_partner',
    relationship_stage: 'inactive',
    relationship_strength: 'unknown',
  },
};

function assertPipelineStage(stage) {
  const v = String(stage || '').trim();
  if (!PIPELINE_STAGES.includes(v)) {
    const err = new Error(`Invalid pipeline_stage: ${v}`);
    err.code = 'INVALID_INPUT';
    throw err;
  }
  return v;
}

function deriveFieldsFromPipelineStage(stage) {
  const key = assertPipelineStage(stage);
  return { pipeline_stage: key, ...(STAGE_TO_FIELDS[key] || {}) };
}

function hasContactInfo(prospect = {}) {
  return Boolean(
    (prospect.contact_name && String(prospect.contact_name).trim()) ||
      (prospect.decision_maker_name && String(prospect.decision_maker_name).trim()) ||
      (prospect.phone && String(prospect.phone).trim()) ||
      (prospect.email && String(prospect.email).trim())
  );
}

function inferPipelineStageFromProspect(prospect = {}) {
  if (prospect.pipeline_stage && PIPELINE_STAGES.includes(prospect.pipeline_stage)) {
    return prospect.pipeline_stage;
  }

  const status = prospect.builder_status || 'prospect';
  const stage = prospect.relationship_stage || 'discovered';
  const research = prospect.research_status || 'not_started';

  if (status === 'strategic_partner') return 'strategic_partner';
  if (status === 'inactive_partner' || stage === 'inactive' || stage === 'not_fit') return 'inactive';
  if (status === 'active_partner' || stage === 'working_together') return 'active_builder';
  if (stage === 'proposal_sent') return 'opportunity';
  if (stage === 'meeting_booked' || stage === 'contacted') return 'relationship_building';
  if (hasContactInfo(prospect) && ['qualified', 'contacted'].includes(stage)) return 'contact_ready';
  if (hasContactInfo(prospect) && research === 'researched') return 'contact_ready';
  if (research === 'researched' || research === 'needs_update') return 'contact_discovery';
  return 'target';
}

function suggestPipelineStageAfterResearch(prospect = {}) {
  if (hasContactInfo(prospect)) return 'contact_ready';
  if (prospect.research_status === 'researched') return 'contact_discovery';
  return 'target';
}

function pipelineNextAction(stage) {
  return PIPELINE_NEXT_ACTIONS[stage] || PIPELINE_NEXT_ACTIONS.target;
}

function getAdjacentPipelineStage(stage, direction) {
  const current = assertPipelineStage(stage);
  if (direction === 'next') {
    const idx = PIPELINE_STAGE_ORDER.indexOf(current);
    if (idx < 0 || idx >= PIPELINE_STAGE_ORDER.length - 1) return null;
    return PIPELINE_STAGE_ORDER[idx + 1];
  }
  if (direction === 'previous') {
    const idx = PIPELINE_STAGE_ORDER.indexOf(current);
    if (idx <= 0) return null;
    return PIPELINE_STAGE_ORDER[idx - 1];
  }
  return null;
}

function pipelineStageOptions() {
  return PIPELINE_STAGES.map((value) => ({
    value,
    label: require('./pipelineStageConstants').PIPELINE_STAGE_LABELS[value],
  }));
}

module.exports = {
  STAGE_TO_FIELDS,
  assertPipelineStage,
  deriveFieldsFromPipelineStage,
  inferPipelineStageFromProspect,
  suggestPipelineStageAfterResearch,
  pipelineNextAction,
  getAdjacentPipelineStage,
  pipelineStageOptions,
  hasContactInfo,
};
