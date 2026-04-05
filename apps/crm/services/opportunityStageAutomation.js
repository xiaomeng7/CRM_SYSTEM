/**
 * Opportunity Stage Automation Engine
 * Advances opportunity.stage from system events; respects stage_locked and Won/Lost.
 * All changes written to automation_audit_log.
 */

const { pool } = require('../lib/db');
const { OPPORTUNITY_STAGES, CLOSED_STAGES, EVENT_TO_STAGE, AUDIT_SOURCE } = require('../lib/stage-constants');
const { enqueueOpportunityWonConversionEvent } = require('./googleOfflineConversions');

const SOURCE = AUDIT_SOURCE.STAGE_AUTOMATION;

/**
 * Get target stage for event. Returns null if event not mapped.
 */
function getTargetStageForEvent(eventType) {
  if (!eventType || typeof eventType !== 'string') return null;
  const key = eventType.trim().toLowerCase().replace(/\s+/g, '_');
  return EVENT_TO_STAGE[key] || null;
}

/**
 * Advance opportunity stage by event. Idempotent; does not overwrite closed or locked.
 * @param {string} opportunityId - UUID
 * @param {string} eventType - one of job_created, inspection_completed, report_sent, quote_sent, quote_accepted, quote_declined
 * @param {object} options - { db?, dryRun?, log?, created_by? }
 * @returns {Promise<{ applied: boolean, reason?: string, previous_stage?: string, new_stage?: string }>}
 */
async function advanceOpportunityStage(opportunityId, eventType, options = {}) {
  const db = options.db || pool;
  const dryRun = Boolean(options.dryRun);

  const targetStage = getTargetStageForEvent(eventType);
  if (!targetStage) {
    if (options.log) options.log(`Unknown eventType: ${eventType}`);
    return { applied: false, reason: 'unknown_event' };
  }

  const row = await db.query(
    `SELECT id, stage, stage_locked FROM opportunities WHERE id = $1`,
    [opportunityId]
  ).then((r) => r.rows[0]);

  if (!row) {
    return { applied: false, reason: 'opportunity_not_found' };
  }

  if (row.stage_locked === true) {
    if (options.log) options.log(`Opportunity ${opportunityId} stage_locked, skip`);
    return { applied: false, reason: 'stage_locked', previous_stage: row.stage };
  }

  if (CLOSED_STAGES.includes(row.stage) && targetStage !== row.stage) {
    if (options.log) options.log(`Opportunity ${opportunityId} already ${row.stage}, skip overwrite`);
    return { applied: false, reason: 'closed_stage', previous_stage: row.stage };
  }

  if (row.stage === targetStage) {
    if (!dryRun) {
      await writeAudit(db, {
        entity_type: 'opportunity',
        entity_id: opportunityId,
        action_type: 'stage_advance',
        old_value: row.stage,
        new_value: targetStage,
        trigger_event: eventType,
        source: SOURCE,
      });
    }
    return { applied: false, reason: 'idempotent', previous_stage: row.stage, new_stage: row.stage };
  }

  if (dryRun) {
    return { applied: true, reason: 'dry_run', previous_stage: row.stage, new_stage: targetStage };
  }

  const updateCols = ['stage = $1', 'updated_at = NOW()', "created_by = COALESCE($2, created_by)"];
  const params = [targetStage, options.created_by || SOURCE, opportunityId];

  if (targetStage === OPPORTUNITY_STAGES.QUOTED) {
    updateCols.push('quote_sent_at = COALESCE(quote_sent_at, NOW())');
  }
  if (targetStage === OPPORTUNITY_STAGES.WON) {
    updateCols.push('status = \'closed\'', 'closed_at = COALESCE(closed_at, NOW())', 'won_at = COALESCE(won_at, NOW())');
  }
  if (targetStage === OPPORTUNITY_STAGES.LOST) {
    updateCols.push('status = \'closed\'', 'closed_at = COALESCE(closed_at, NOW())', 'lost_at = COALESCE(lost_at, NOW())');
    if (options.lost_reason) {
      updateCols.push('lost_reason = $4');
      params.push(options.lost_reason);
    }
  }

  await db.query(
    `UPDATE opportunities SET ${updateCols.join(', ')} WHERE id = $3`,
    params
  );

  await writeAudit(db, {
    entity_type: 'opportunity',
    entity_id: opportunityId,
    action_type: 'stage_advance',
    old_value: row.stage,
    new_value: targetStage,
    trigger_event: eventType,
    source: SOURCE,
  });

  if (targetStage === OPPORTUNITY_STAGES.WON && row.stage !== OPPORTUNITY_STAGES.WON) {
    try {
      await enqueueOpportunityWonConversionEvent(opportunityId, {
        db,
        source: 'opportunityStageAutomation',
        sourcePayload: { trigger_event: eventType },
      });
    } catch (e) {
      console.error('[google-offline] enqueue opportunity_won failed:', e.message || e);
    }
  }

  return { applied: true, previous_stage: row.stage, new_stage: targetStage };
}

/**
 * Write stage automation to automation_audit_log.
 */
async function writeAudit(db, data) {
  const {
    entity_type,
    entity_id,
    action_type,
    old_value,
    new_value,
    trigger_event,
    source,
  } = data;

  await db.query(
    `INSERT INTO automation_audit_log (event_type, entity_type, entity_id, source, payload, action_type, old_value, new_value, trigger_event, executed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
    [
      'opportunity_stage_advance',
      entity_type || null,
      entity_id || null,
      source || SOURCE,
      JSON.stringify({ action_type, old_value, new_value, trigger_event }),
      action_type || 'stage_advance',
      old_value ?? null,
      new_value ?? null,
      trigger_event ?? null,
    ]
  );
}

module.exports = {
  advanceOpportunityStage,
  getTargetStageForEvent,
  EVENT_TO_STAGE,
  OPPORTUNITY_STAGES,
};
