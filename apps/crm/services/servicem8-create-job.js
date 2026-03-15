/**
 * Phase 2A: CRM → ServiceM8 Job Creation.
 * Single service: validate → resolve company → create job in ServiceM8 → persist in CRM → audit + stage.
 * Idempotent: one job per opportunity (by convention); duplicate request returns existing.
 */

const { ServiceM8Client } = require('@bht/integrations');
const { pool } = require('../lib/db');
const { ensureServiceM8LinkForAccount } = require('./servicem8-sync');
const { advanceOpportunityStage } = require('./opportunityStageAutomation');
const { buildDefaultJobDescription } = require('../lib/servicem8/job-description-builder');

const AUDIT_SOURCE = 'crm-create-servicem8-job';
const CREATED_VIA = 'crm';

const ERROR_CODES = {
  OPPORTUNITY_NOT_FOUND: 'opportunity_not_found',
  ACCOUNT_NOT_MAPPED: 'account_not_mapped',
  SERVICEM8_API_ERROR: 'servicem8_api_error',
  ALREADY_CREATED: 'already_created',
  VALIDATION: 'validation',
  NETWORK: 'network',
};

/**
 * Load opportunity with account and contact for job creation.
 */
async function loadOpportunityContext(db, opportunityId) {
  const r = await db.query(
    `SELECT o.id, o.account_id, o.contact_id, o.stage, o.stage_locked, o.service_m8_job_id, o.value_estimate,
            a.id AS account_id, a.name AS account_name, a.address_line AS account_address, a.suburb AS account_suburb, a.postcode,
            c.name AS contact_name, c.phone AS contact_phone, c.email AS contact_email
     FROM opportunities o
     LEFT JOIN accounts a ON a.id = o.account_id
     LEFT JOIN contacts c ON c.id = o.contact_id
     WHERE o.id = $1`,
    [opportunityId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    opportunity: {
      id: row.id,
      account_id: row.account_id,
      contact_id: row.contact_id,
      stage: row.stage,
      stage_locked: row.stage_locked,
      service_m8_job_id: row.service_m8_job_id,
      value_estimate: row.value_estimate,
    },
    account: row.account_id
      ? {
          id: row.account_id,
          name: row.account_name,
          address_line: row.account_address,
          suburb: row.account_suburb,
          postcode: row.postcode,
        }
      : null,
    contact: row.contact_id
      ? {
          id: row.contact_id,
          name: row.contact_name,
          phone: row.contact_phone,
          email: row.contact_email,
        }
      : null,
  };
}

/**
 * Write automation_audit_log for create-servicem8-job.
 */
async function writeAudit(db, payload) {
  await db.query(
    `INSERT INTO automation_audit_log (event_type, entity_type, entity_id, source, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      'crm_create_servicem8_job',
      'opportunity',
      payload.opportunity_id,
      AUDIT_SOURCE,
      JSON.stringify(payload),
    ]
  );
}

/**
 * Create ServiceM8 job from CRM opportunity. Idempotent: if opportunity already has service_m8_job_id, returns existing.
 *
 * @param {Object} params - { opportunity_id, description?, address_override?, create_reason? }
 * @param {Object} options - { db?, dryRun?, log? }
 * @returns {Promise<{ ok: boolean, job_id?: string, job_uuid?: string, job_number?: string, already_created?: boolean, error?: string, error_code?: string }>}
 */
async function createServiceM8JobFromCRM(params, options = {}) {
  const db = options.db || pool;
  const dryRun = Boolean(options.dryRun);
  const log = options.log || (() => {});

  const opportunityId = params.opportunity_id;
  if (!opportunityId) {
    return { ok: false, error: 'opportunity_id is required', error_code: ERROR_CODES.VALIDATION };
  }

  const ctx = await loadOpportunityContext(db, opportunityId);
  if (!ctx) {
    return { ok: false, error: 'Opportunity not found', error_code: ERROR_CODES.OPPORTUNITY_NOT_FOUND };
  }

  const { opportunity, account, contact } = ctx;

  // Idempotency: already has a job linked
  if (opportunity.service_m8_job_id) {
    const existing = await db.query(
      `SELECT id, servicem8_job_uuid, job_number FROM jobs WHERE servicem8_job_uuid = $1 LIMIT 1`,
      [opportunity.service_m8_job_id]
    );
    const row = existing.rows[0];
    log('already_created', { opportunity_id: opportunityId, job_uuid: opportunity.service_m8_job_id });
    return {
      ok: true,
      already_created: true,
      job_id: row?.id,
      job_uuid: opportunity.service_m8_job_id,
      job_number: row?.job_number,
    };
  }

  if (!account || !account.id) {
    return { ok: false, error: 'Opportunity has no account', error_code: ERROR_CODES.VALIDATION };
  }

  // Resolve ServiceM8 company UUID (ensure link exists)
  let linkResult;
  try {
    linkResult = await ensureServiceM8LinkForAccount(account.id, { db, dryRun: false });
  } catch (e) {
    log('ensureServiceM8LinkForAccount error', { error: e.message });
    return {
      ok: false,
      error: `Account not linked to ServiceM8: ${e.message}`,
      error_code: ERROR_CODES.ACCOUNT_NOT_MAPPED,
    };
  }

  if (!linkResult || !linkResult.companyUuid) {
    return {
      ok: false,
      error: 'Account could not be mapped to a ServiceM8 company',
      error_code: ERROR_CODES.ACCOUNT_NOT_MAPPED,
    };
  }

  const companyUuid = linkResult.companyUuid;
  const jobAddress =
    (params.address_override && String(params.address_override).trim()) ||
    [account.address_line, account.suburb].filter(Boolean).join(', ') ||
    'Address not provided';
  const jobDescription = buildDefaultJobDescription(
    {
      opportunity: { value_estimate: opportunity.value_estimate },
      account: { name: account.name, address_line: account.address_line, suburb: account.suburb },
      contact: contact ? { name: contact.name } : null,
      notes: params.create_reason || '',
    },
    params.description
  );

  if (dryRun) {
    log('dry_run', { companyUuid, jobAddress: jobAddress.slice(0, 80), jobDescription: jobDescription.slice(0, 80) });
    return { ok: true, dry_run: true, would_create: true };
  }

  let jobUuid;
  let jobNumber;
  try {
    const client = new ServiceM8Client();
    const created = await client.createJob(companyUuid, {
      job_address: jobAddress,
      job_description: jobDescription,
      status: 'Quote',
    });
    jobUuid = created.uuid;
    jobNumber = created.job_number;
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    const isNetwork = /timeout|ECONNRESET|ETIMEDOUT|network/i.test(msg);
    log('servicem8 createJob error', { error: msg });
    return {
      ok: false,
      error: msg,
      error_code: isNetwork ? ERROR_CODES.NETWORK : ERROR_CODES.SERVICEM8_API_ERROR,
    };
  }

  // Persist in CRM: insert jobs row, update opportunity.service_m8_job_id
  try {
    const ins = await db.query(
      `INSERT INTO jobs (account_id, contact_id, servicem8_job_uuid, job_number, description, address_line, suburb, status, source_opportunity_id, created_via, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        account.id,
        contact ? contact.id : null,
        jobUuid,
        jobNumber || null,
        jobDescription.slice(0, 2000),
        jobAddress.slice(0, 500),
        (account.suburb || '').slice(0, 100),
        'Quote',
        opportunityId,
        CREATED_VIA,
        AUDIT_SOURCE,
      ]
    );
    const jobId = ins.rows[0].id;

    await db.query(
      `UPDATE opportunities SET service_m8_job_id = $1, next_action_at = COALESCE(next_action_at, NOW()), updated_at = NOW() WHERE id = $2`,
      [jobUuid, opportunityId]
    );

    await writeAudit(db, {
      opportunity_id: opportunityId,
      account_id: account.id,
      contact_id: contact ? contact.id : null,
      servicem8_job_uuid: jobUuid,
      job_id: jobId,
      job_number: jobNumber,
      result: 'created',
      create_reason: params.create_reason || null,
    });

    // Advance stage via engine (respects stage_locked and closed)
    await advanceOpportunityStage(opportunityId, 'job_created', {
      db,
      created_by: AUDIT_SOURCE,
      log,
    });

    log('created', { opportunity_id: opportunityId, job_uuid: jobUuid, job_id: jobId });
    return {
      ok: true,
      job_id: jobId,
      job_uuid: jobUuid,
      job_number: jobNumber,
    };
  } catch (e) {
    log('persist_or_audit error', { error: e.message });
    return {
      ok: false,
      error: `Job created in ServiceM8 but CRM update failed: ${e.message}. Job UUID: ${jobUuid}. Manual link may be required.`,
      error_code: ERROR_CODES.SERVICEM8_API_ERROR,
      job_uuid: jobUuid,
    };
  }
}

module.exports = {
  createServiceM8JobFromCRM,
  loadOpportunityContext,
  ERROR_CODES,
  AUDIT_SOURCE,
};
