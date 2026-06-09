/**
 * Founder-facing Relationship Level → internal CRM fields (PR8G.2).
 */

const RELATIONSHIP_LEVELS = [
  'never_contacted',
  'met_once',
  'spoken',
  'quoted',
  'worked_together',
  'trusted_partner',
  'strategic_partner',
];

const RELATIONSHIP_LEVEL_LABELS = {
  never_contacted: 'Never Contacted',
  met_once: 'Met Once',
  spoken: 'Spoken',
  quoted: 'Quoted',
  worked_together: 'Worked Together',
  trusted_partner: 'Trusted Partner',
  strategic_partner: 'Strategic Partner',
};

const LEVEL_TO_FIELDS = {
  never_contacted: {
    relationship_strength: 'unknown',
    builder_status: 'prospect',
    relationship_stage: 'discovered',
  },
  met_once: {
    relationship_strength: 'met_once',
    builder_status: 'prospect',
    relationship_stage: 'contacted',
  },
  spoken: {
    relationship_strength: 'known',
    builder_status: 'prospect',
    relationship_stage: 'contacted',
  },
  quoted: {
    relationship_strength: 'known',
    builder_status: 'prospect',
    relationship_stage: 'proposal_sent',
  },
  worked_together: {
    relationship_strength: 'worked_together',
    builder_status: 'active_partner',
    relationship_stage: 'working_together',
  },
  trusted_partner: {
    relationship_strength: 'trusted_partner',
    builder_status: 'active_partner',
    relationship_stage: 'working_together',
  },
  strategic_partner: {
    relationship_strength: 'trusted_partner',
    builder_status: 'strategic_partner',
    relationship_stage: 'working_together',
  },
};

function assertRelationshipLevel(level) {
  const v = String(level || '').trim();
  if (!RELATIONSHIP_LEVELS.includes(v)) {
    const err = new Error(`Invalid relationship_level: ${v}`);
    err.code = 'INVALID_INPUT';
    throw err;
  }
  return v;
}

function deriveFieldsFromRelationshipLevel(level) {
  const key = assertRelationshipLevel(level);
  return { ...LEVEL_TO_FIELDS[key], relationship_level: key };
}

function inferRelationshipLevelFromProspect(prospect) {
  const p = prospect || {};
  const status = p.builder_status || 'prospect';
  const strength = p.relationship_strength || 'unknown';
  const stage = p.relationship_stage || 'discovered';

  if (status === 'strategic_partner') return 'strategic_partner';
  if (status === 'active_partner' && strength === 'trusted_partner') return 'trusted_partner';
  if (status === 'active_partner' || strength === 'worked_together') return 'worked_together';
  if (stage === 'proposal_sent' || (stage === 'qualified' && strength === 'known')) return 'quoted';
  if (strength === 'known') return 'spoken';
  if (strength === 'met_once') return 'met_once';
  return 'never_contacted';
}

function relationshipLevelOptions() {
  return RELATIONSHIP_LEVELS.map((value) => ({
    value,
    label: RELATIONSHIP_LEVEL_LABELS[value] || value,
  }));
}

module.exports = {
  RELATIONSHIP_LEVELS,
  RELATIONSHIP_LEVEL_LABELS,
  LEVEL_TO_FIELDS,
  deriveFieldsFromRelationshipLevel,
  inferRelationshipLevelFromProspect,
  relationshipLevelOptions,
  assertRelationshipLevel,
};
