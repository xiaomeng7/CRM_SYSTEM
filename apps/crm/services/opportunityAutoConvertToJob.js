/**
 * Opportunity Auto Convert → Job.
 * When opportunity stage becomes Inspection Booked or Qualified, auto-create ServiceM8 job if none exists.
 * One primary job per opportunity (enforced by createServiceM8JobFromCRM).
 */

const { pool } = require('../lib/db');
const { OPPORTUNITY_STAGES } = require('../lib/stage-constants');
const { createServiceM8JobFromCRM } = require('./servicem8-create-job');

/** Stages that trigger auto-create of ServiceM8 job */
const STAGES_TRIGGER_JOB = [
  OPPORTUNITY_STAGES.INSPECTION_BOOKED, // site_visit_booked (Inspection Booked)
  OPPORTUNITY_STAGES.QUALIFIED,          // qualified
];

/**
 * Ensure opportunity has a primary ServiceM8 job. If stage is Inspection Booked or Qualified
 * and no job exists, create one. Idempotent; one job per opportunity.
 *
 * @param {string} opportunityId - UUID
 * @param {Object} options - { db?, dryRun?, log? }
 * @returns {Promise<{ ran: boolean, created?: boolean, already_has_job?: boolean, job_uuid?: string, error?: string, reason?: string }>}
 */
async function ensurePrimaryJobForOpportunity(opportunityId, options = {}) {
  const db = options.db || pool;
  const dryRun = Boolean(options.dryRun);
  const log = options.log || (() => {});

  const row = await db.query(
    `SELECT id, stage, service_m8_job_id FROM opportunities WHERE id = $1`,
    [opportunityId]
  ).then((r) => r.rows[0]);

  if (!row) {
    return { ran: false, reason: 'opportunity_not_found' };
  }

  if (!STAGES_TRIGGER_JOB.includes(row.stage)) {
    return { ran: false, reason: 'stage_not_trigger', stage: row.stage };
  }

  if (row.service_m8_job_id) {
    log('already_has_job', { opportunity_id: opportunityId, job_uuid: row.service_m8_job_id });
    return {
      ran: true,
      created: false,
      already_has_job: true,
      job_uuid: row.service_m8_job_id,
      reason: 'one_primary_job_per_opportunity',
    };
  }

  const result = await createServiceM8JobFromCRM(
    { opportunity_id: opportunityId },
    { db, dryRun, log }
  );

  if (result.ok && result.already_created) {
    return {
      ran: true,
      created: false,
      already_has_job: true,
      job_uuid: result.job_uuid,
    };
  }

  if (result.ok) {
    return {
      ran: true,
      created: true,
      job_uuid: result.job_uuid,
      job_id: result.job_id,
      job_number: result.job_number,
    };
  }

  return {
    ran: true,
    created: false,
    error: result.error,
    error_code: result.error_code,
  };
}

module.exports = {
  ensurePrimaryJobForOpportunity,
  STAGES_TRIGGER_JOB,
};
