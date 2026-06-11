/**
 * Builder development pipeline service (PR10A).
 */

const { pool } = require('../../lib/db');
const { PROSPECT_TYPE_BUILDER } = require('./builderProspectConstants');
const {
  PIPELINE_UI_SECTIONS,
  PIPELINE_SUMMARY_GROUPS,
  PIPELINE_STAGE_LABELS,
} = require('./pipelineStageConstants');
const {
  assertPipelineStage,
  deriveFieldsFromPipelineStage,
  inferPipelineStageFromProspect,
  pipelineNextAction,
  getAdjacentPipelineStage,
} = require('./pipelineStageMapping');
const { applyRelationshipDerivation } = require('./builderRelationshipDerivation');

async function logPipelineActivity(prospectId, fields, options = {}) {
  const db = options.db || pool;
  const r = await db.query(
    `INSERT INTO builder_pipeline_activity (prospect_id, activity_type, from_stage, to_stage, body)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      prospectId,
      fields.activity_type || 'stage_change',
      fields.from_stage || null,
      fields.to_stage || null,
      fields.body || null,
    ]
  );
  return r.rows[0];
}

async function listPipelineActivity(prospectId, options = {}) {
  const db = options.db || pool;
  const limit = Math.min(Math.max(parseInt(options.limit, 10) || 20, 1), 100);
  const r = await db.query(
    `SELECT * FROM builder_pipeline_activity
     WHERE prospect_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [prospectId, limit]
  );
  return r.rows;
}

function decoratePipelineBuilder(row) {
  const stage = inferPipelineStageFromProspect(row);
  return {
    ...row,
    pipeline_stage: stage,
    pipeline_stage_label: PIPELINE_STAGE_LABELS[stage] || stage,
    pipeline_next_action: pipelineNextAction(stage),
    relationship_level: row.relationship_level,
  };
}

async function loadPipelineBuilders(options = {}) {
  const db = options.db || pool;
  const includeInactive = Boolean(options.include_inactive);
  const r = await db.query(
    `SELECT
       p.*,
       bp.estimated_fit_score,
       bp.recommended_founder_action,
       ts.next_best_action AS suggested_action,
       ts.target_score,
       ts.target_band,
       ts.founder_priority_score,
       ts.founder_priority_band,
       ts.partner_value_score,
       ts.partner_value_band,
       ts.score_kind
     FROM b2b_prospects p
     LEFT JOIN builder_profiles bp ON bp.prospect_id = p.id
     LEFT JOIN builder_target_scores ts ON ts.prospect_id = p.id
     WHERE p.prospect_type = $1
     ${includeInactive ? '' : "AND COALESCE(p.pipeline_stage, 'target') <> 'inactive' AND p.relationship_stage NOT IN ('inactive', 'not_fit')"}
     ORDER BY
       ts.founder_priority_score DESC NULLS LAST,
       ts.target_score DESC NULLS LAST,
       p.updated_at DESC NULLS LAST,
       p.company_name ASC`,
    [PROSPECT_TYPE_BUILDER]
  );

  const { decorateProspectPipelineFields } = require('./builderProspectService');
  return r.rows.map((row) => decorateProspectPipelineFields(row));
}

function buildPipelineSummary(builders) {
  const counts = Object.fromEntries(PIPELINE_SUMMARY_GROUPS.map((g) => [g.id, 0]));
  const stageCounts = {};

  for (const builder of builders) {
    const stage = builder.pipeline_stage || 'target';
    stageCounts[stage] = (stageCounts[stage] || 0) + 1;
    for (const group of PIPELINE_SUMMARY_GROUPS) {
      if (group.stages.includes(stage)) {
        counts[group.id] += 1;
      }
    }
  }

  return {
    groups: PIPELINE_SUMMARY_GROUPS.map((g) => ({
      id: g.id,
      label: g.label,
      count: counts[g.id] || 0,
    })),
    stage_counts: stageCounts,
    total_active: builders.length,
  };
}

function groupBuildersByPipelineSections(builders) {
  return PIPELINE_UI_SECTIONS.map((section) => {
    const items = builders
      .filter((b) => section.stages.includes(b.pipeline_stage))
      .slice(0, 12);
    return {
      ...section,
      count: builders.filter((b) => section.stages.includes(b.pipeline_stage)).length,
      builders: items,
    };
  });
}

async function getBuilderPipelineView(options = {}) {
  const builders = await loadPipelineBuilders(options);
  const { attachRecommendedContacts } = require('./contactDiscovery/builderContactDiscoveryService');
  const { attachPendingStageSuggestions } = require('./builderStageSuggestionService');
  const withContacts = await attachRecommendedContacts(builders, options);
  const withSuggestions = await attachPendingStageSuggestions(withContacts, options);
  return {
    summary: buildPipelineSummary(withSuggestions),
    sections: groupBuildersByPipelineSections(withSuggestions),
    builders: withSuggestions,
  };
}

async function transitionPipelineStage(prospectId, input = {}, options = {}) {
  const db = options.db || pool;
  const existingRes = await db.query(
    `SELECT * FROM b2b_prospects WHERE id = $1 AND prospect_type = $2`,
    [prospectId, PROSPECT_TYPE_BUILDER]
  );
  const existing = existingRes.rows[0];
  if (!existing) {
    const err = new Error('Builder prospect not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const fromStage = inferPipelineStageFromProspect(existing);
  let toStage = input.to_stage;

  if (!toStage && input.direction) {
    toStage = getAdjacentPipelineStage(fromStage, input.direction);
  }

  if (!toStage) {
    const err = new Error('No valid pipeline stage transition');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  assertPipelineStage(toStage);

  let updates = deriveFieldsFromPipelineStage(toStage);
  updates = applyRelationshipDerivation(updates, existing, {
    derivedFromRelationshipLevel: false,
  });

  const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`);
  const values = [prospectId, ...Object.values(updates)];
  values.push(PROSPECT_TYPE_BUILDER);

  const updatedRes = await db.query(
    `UPDATE b2b_prospects SET ${setClauses.join(', ')}, updated_at = now()
     WHERE id = $1 AND prospect_type = $${values.length}
     RETURNING *`,
    values
  );

  const activity = await logPipelineActivity(
    prospectId,
    {
      activity_type: 'stage_change',
      from_stage: fromStage,
      to_stage: toStage,
      body:
        input.note ||
        `Moved from ${PIPELINE_STAGE_LABELS[fromStage] || fromStage} to ${PIPELINE_STAGE_LABELS[toStage] || toStage}`,
    },
    { db }
  );

  const { decorateProspectPipelineFields } = require('./builderProspectService');
  const prospect = decorateProspectPipelineFields(updatedRes.rows[0]);
  return { prospect, activity, from_stage: fromStage, to_stage: toStage };
}

module.exports = {
  getBuilderPipelineView,
  transitionPipelineStage,
  listPipelineActivity,
  logPipelineActivity,
  buildPipelineSummary,
  decoratePipelineBuilder,
};
