/**
 * Builder pipeline stage suggestions — founder approval required (PR10C).
 */

const { pool } = require('../../lib/db');
const { PROSPECT_TYPE_BUILDER } = require('./builderProspectConstants');
const { PIPELINE_STAGE_LABELS } = require('./pipelineStageConstants');
const { inferPipelineStageFromProspect, assertPipelineStage } = require('./pipelineStageMapping');
const { transitionPipelineStage } = require('./builderPipelineService');
const { SUGGESTION_STATUSES, SUGGESTION_SOURCES } = require('./stageSuggestionConstants');

function confidenceBand(score) {
  if (score >= 75) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

function suggestionTitle(suggestion) {
  const label = PIPELINE_STAGE_LABELS[suggestion.suggested_to_stage] || suggestion.suggested_to_stage;
  return `Move to ${label}`;
}

function decorateSuggestion(row) {
  if (!row) return null;
  return {
    ...row,
    title: suggestionTitle(row),
  };
}

function hasProjectNote(prospect = {}) {
  const text = `${prospect.founder_notes || ''}\n${prospect.notes || ''}`.toLowerCase();
  return /\b(project|quote|tender|opportunity|renovation|new build|development)\b/i.test(text);
}

function hasWonJobSignal(prospect = {}) {
  if (prospect.timing_status === 'active_project') return true;
  const text = `${prospect.founder_notes || ''}\n${prospect.notes || ''}`.toLowerCase();
  return /\b(won|awarded|signed contract|job confirmed|project won)\b/i.test(text);
}

function hasRepeatedWorkSignal(prospect = {}) {
  if (prospect.relationship_strength === 'trusted_partner') return true;
  if (prospect.builder_status === 'active_partner' && prospect.relationship_strength === 'worked_together') {
    const text = `${prospect.founder_notes || ''}\n${prospect.notes || ''}`.toLowerCase();
    return /\b(repeat|second job|third job|ongoing|multiple projects|regular work)\b/i.test(text);
  }
  return false;
}

function hasLoggedCall(prospect = {}) {
  if (prospect.last_contacted_at) return true;
  const level = prospect.relationship_level;
  return ['met_once', 'spoken', 'quoted', 'worked_together', 'trusted_partner', 'strategic_partner'].includes(
    level
  );
}

/**
 * Pure rule evaluation — returns zero or more suggestion candidates.
 */
function evaluateStageSuggestionRules(prospect = {}) {
  const stage = inferPipelineStageFromProspect(prospect);
  const out = [];

  if (stage === 'contact_ready' && hasLoggedCall(prospect)) {
    out.push({
      suggested_from_stage: stage,
      suggested_to_stage: 'relationship_building',
      reason: 'Founder has contacted this builder — ready to build the relationship.',
      confidence_score: 78,
      source: 'manual',
    });
  }

  if (stage === 'relationship_building' && hasProjectNote(prospect)) {
    out.push({
      suggested_from_stage: stage,
      suggested_to_stage: 'opportunity',
      reason: 'Project or quoting activity noted — opportunity may be open.',
      confidence_score: 72,
      source: 'manual',
    });
  }

  if (stage === 'opportunity' && hasWonJobSignal(prospect)) {
    out.push({
      suggested_from_stage: stage,
      suggested_to_stage: 'active_builder',
      reason: 'Job won or active project signal detected.',
      confidence_score: 80,
      source: 'manual',
    });
  }

  if (stage === 'active_builder' && hasRepeatedWorkSignal(prospect)) {
    out.push({
      suggested_from_stage: stage,
      suggested_to_stage: 'strategic_partner',
      reason: 'Repeated successful work — consider strategic partner status.',
      confidence_score: 70,
      source: 'manual',
    });
  }

  return out;
}

async function getProspectForSuggestions(prospectId, db) {
  const r = await db.query(
    `SELECT * FROM b2b_prospects WHERE id = $1 AND prospect_type = $2`,
    [prospectId, PROSPECT_TYPE_BUILDER]
  );
  const row = r.rows[0];
  if (!row) {
    const err = new Error('Builder prospect not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const { inferRelationshipLevelFromProspect } = require('./relationshipLevelMapping');
  return { ...row, relationship_level: inferRelationshipLevelFromProspect(row) };
}

async function listStageSuggestions(prospectId, options = {}) {
  const db = options.db || pool;
  const status = options.status || null;
  const params = [prospectId];
  let where = 'WHERE prospect_id = $1';
  if (status) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  const r = await db.query(
    `SELECT * FROM builder_stage_suggestions ${where} ORDER BY created_at DESC LIMIT 50`,
    params
  );
  return r.rows.map(decorateSuggestion);
}

async function getPendingStageSuggestion(prospectId, options = {}) {
  const db = options.db || pool;
  const r = await db.query(
    `SELECT * FROM builder_stage_suggestions
     WHERE prospect_id = $1 AND status = 'pending'
     ORDER BY created_at DESC
     LIMIT 1`,
    [prospectId]
  );
  return decorateSuggestion(r.rows[0] || null);
}

async function createStageSuggestion(prospectId, fields, options = {}) {
  const db = options.db || pool;
  const prospect = await getProspectForSuggestions(prospectId, db);
  const fromStage = fields.suggested_from_stage || inferPipelineStageFromProspect(prospect);
  const toStage = fields.suggested_to_stage;
  assertPipelineStage(toStage);

  if (fromStage === toStage) {
    const err = new Error('Suggested stage matches current stage');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const source = fields.source || 'manual';
  if (!SUGGESTION_SOURCES.includes(source)) {
    const err = new Error(`Invalid suggestion source: ${source}`);
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const confidenceScore = Math.min(100, Math.max(0, parseInt(fields.confidence_score, 10) || 50));

  await db.query(
    `UPDATE builder_stage_suggestions
     SET status = 'dismissed', resolved_at = now(), resolution_note = 'Superseded by newer suggestion', updated_at = now()
     WHERE prospect_id = $1 AND status = 'pending'`,
    [prospectId]
  );

  const r = await db.query(
    `INSERT INTO builder_stage_suggestions (
       prospect_id, suggested_from_stage, suggested_to_stage, reason,
       confidence_score, confidence_band, status, source
     ) VALUES ($1,$2,$3,$4,$5,$6,'pending',$7)
     RETURNING *`,
    [
      prospectId,
      fromStage,
      toStage,
      fields.reason || `Suggest moving to ${PIPELINE_STAGE_LABELS[toStage] || toStage}`,
      confidenceScore,
      fields.confidence_band || confidenceBand(confidenceScore),
      source,
    ]
  );
  return decorateSuggestion(r.rows[0]);
}

async function suggestContactReadyAfterConfirm(prospectId, contact, options = {}) {
  const db = options.db || pool;
  const prospect = await getProspectForSuggestions(prospectId, db);
  const fromStage = inferPipelineStageFromProspect(prospect);
  const label = contact?.name || contact?.phone || contact?.email || 'contact';
  return createStageSuggestion(
    prospectId,
    {
      suggested_from_stage: fromStage,
      suggested_to_stage: 'contact_ready',
      reason: `Contact confirmed (${label}) — approve to move builder to Ready To Contact.`,
      confidence_score: 85,
      confidence_band: 'high',
      source: 'contact_discovery',
    },
    { db }
  );
}

async function refreshStageSuggestionsForProspect(prospectId, options = {}) {
  const db = options.db || pool;
  const prospect = await getProspectForSuggestions(prospectId, db);
  const candidates = evaluateStageSuggestionRules(prospect);
  let latest = await getPendingStageSuggestion(prospectId, { db });

  for (const candidate of candidates) {
    if (candidate.suggested_to_stage === inferPipelineStageFromProspect(prospect)) continue;
    if (latest && latest.suggested_to_stage === candidate.suggested_to_stage) continue;
    latest = await createStageSuggestion(prospectId, candidate, { db });
  }

  return latest;
}

async function approveStageSuggestion(suggestionId, options = {}) {
  const db = options.db || pool;
  const r = await db.query(`SELECT * FROM builder_stage_suggestions WHERE id = $1`, [suggestionId]);
  const suggestion = r.rows[0];
  if (!suggestion) {
    const err = new Error('Stage suggestion not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (suggestion.status !== 'pending') {
    const err = new Error('Suggestion is not pending');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const transition = await transitionPipelineStage(
    suggestion.prospect_id,
    {
      to_stage: suggestion.suggested_to_stage,
      note: `Approved suggestion: ${suggestion.reason}`,
    },
    { db }
  );

  const updated = await db.query(
    `UPDATE builder_stage_suggestions
     SET status = 'approved', resolved_at = now(), updated_at = now(), resolution_note = $2
     WHERE id = $1
     RETURNING *`,
    [suggestionId, options.note || 'Founder approved']
  );

  return {
    suggestion: decorateSuggestion(updated.rows[0]),
    ...transition,
  };
}

async function dismissStageSuggestion(suggestionId, options = {}) {
  const db = options.db || pool;
  const r = await db.query(
    `UPDATE builder_stage_suggestions
     SET status = 'dismissed', resolved_at = now(), updated_at = now(), resolution_note = $2
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [suggestionId, options.note || 'Founder dismissed']
  );
  if (!r.rows[0]) {
    const err = new Error('Pending stage suggestion not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  return decorateSuggestion(r.rows[0]);
}

async function attachPendingStageSuggestions(builders, options = {}) {
  const db = options.db || pool;
  if (!builders.length) return builders;

  const ids = builders.map((b) => b.id);
  const r = await db.query(
    `SELECT DISTINCT ON (prospect_id) *
     FROM builder_stage_suggestions
     WHERE prospect_id = ANY($1::uuid[]) AND status = 'pending'
     ORDER BY prospect_id, created_at DESC`,
    [ids]
  );
  const byProspect = new Map(r.rows.map((row) => [row.prospect_id, decorateSuggestion(row)]));

  return builders.map((builder) => {
    const pending = byProspect.get(builder.id) || null;
    const displayAction =
      pending?.title ||
      (builder.pipeline_stage === 'contact_ready' && !hasLoggedCall(builder)
        ? 'Call Builder'
        : builder.pipeline_next_action);
    return {
      ...builder,
      pending_stage_suggestion: pending,
      suggested_next_step: pending?.title || null,
      display_next_action: displayAction,
    };
  });
}

module.exports = {
  evaluateStageSuggestionRules,
  createStageSuggestion,
  suggestContactReadyAfterConfirm,
  refreshStageSuggestionsForProspect,
  listStageSuggestions,
  getPendingStageSuggestion,
  approveStageSuggestion,
  dismissStageSuggestion,
  attachPendingStageSuggestions,
  suggestionTitle,
  decorateSuggestion,
  hasLoggedCall,
};
