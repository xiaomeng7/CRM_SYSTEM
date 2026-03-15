/**
 * Phase 2B: CRM -> ServiceM8 Quote Creation.
 * Validates opportunity/job -> creates quote in ServiceM8 -> saves to CRM -> audit + stage.
 * Idempotency: one active quote per opportunity (if exists and status != declined, return existing).
 */

const { ServiceM8Client } = require('@bht/integrations');
const { pool } = require('../lib/db');
const { advanceOpportunityStage } = require('./opportunityStageAutomation');
const { buildQuoteDescription } = require('../lib/servicem8/quote-description-builder');

const AUDIT_SOURCE = 'crm-create-quote';
const CREATED_VIA = 'crm';

const ERROR_CODES = {
  OPPORTUNITY_NOT_FOUND: 'opportunity_not_found',
  JOB_UUID_MISSING: 'job_uuid_missing',
  SERVICEM8_API_ERROR: 'servicem8_api_error',
  ALREADY_HAS_ACTIVE_QUOTE: 'already_has_active_quote',
  VALIDATION: 'validation',
  NETWORK: 'network',
};

/**
 * Load opportunity with job and account for quote creation.
 */
async function loadOpportunityForQuote(db, opportunityId) {
  const r = await db.query(
    `SELECT o.id, o.account_id, o.contact_id, o.service_m8_job_id, o.value_estimate,
            a.name AS account_name, a.address_line AS account_address, a.suburb AS account_suburb,
            j.id AS job_id
     FROM opportunities o
     LEFT JOIN accounts a ON a.id = o.account_id
     LEFT JOIN jobs j ON j.servicem8_job_uuid = o.service_m8_job_id
     WHERE o.id = $1`,
    [opportunityId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    opportunity_id: row.id,
    account_id: row.account_id,
    contact_id: row.contact_id,
    service_m8_job_id: row.service_m8_job_id,
    job_id: row.job_id,
    value_estimate: row.value_estimate,
    account_name: row.account_name,
    account_address: row.account_address,
    account_suburb: row.account_suburb,
  };
}

/**
 * Get existing active quote for opportunity (status not declined).
 */
async function getActiveQuoteForOpportunity(db, opportunityId) {
  const r = await db.query(
    `SELECT id, servicem8_quote_uuid, amount, status, created_at
     FROM quotes
     WHERE opportunity_id = $1
       AND (status IS NULL OR LOWER(TRIM(COALESCE(status, ''))) != 'declined')
     ORDER BY created_at DESC
     LIMIT 1`,
    [opportunityId]
  );
  return r.rows[0] || null;
}

async function writeAudit(db, payload) {
  await db.query(
    `INSERT INTO automation_audit_log (event_type, entity_type, entity_id, source, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      'crm_create_servicem8_quote',
      'opportunity',
      payload.opportunity_id,
      AUDIT_SOURCE,
      JSON.stringify(payload),
    ]
  );
}

/**
 * Create ServiceM8 quote from CRM opportunity.
 * Idempotency: if opportunity already has an active quote (not declined), return existing.
 *
 * @param {Object} params - { opportunity_id, amount_estimate?, description?, quote_items? (ignored for minimal) }
 * @param {Object} options - { db?, dryRun?, log? }
 */
async function createServiceM8QuoteFromCRM(params, options = {}) {
  const db = options.db || pool;
  const dryRun = Boolean(options.dryRun);
  const log = options.log || (() => {});

  const opportunityId = params.opportunity_id;
  if (!opportunityId) {
    return { ok: false, error: 'opportunity_id is required', error_code: ERROR_CODES.VALIDATION };
  }

  const ctx = await loadOpportunityForQuote(db, opportunityId);
  if (!ctx) {
    return { ok: false, error: 'Opportunity not found', error_code: ERROR_CODES.OPPORTUNITY_NOT_FOUND };
  }

  const existing = await getActiveQuoteForOpportunity(db, opportunityId);
  if (existing) {
    log('already_has_active_quote', { opportunity_id: opportunityId, quote_id: existing.id });
    return {
      ok: true,
      already_created: true,
      quote_id: existing.id,
      servicem8_quote_uuid: existing.servicem8_quote_uuid,
      amount: existing.amount,
      status: existing.status,
    };
  }

  if (!ctx.service_m8_job_id) {
    return {
      ok: false,
      error: 'Opportunity has no linked ServiceM8 job. Create a job first (POST .../create-servicem8-job).',
      error_code: ERROR_CODES.JOB_UUID_MISSING,
    };
  }

  const jobUuid = ctx.service_m8_job_id;
  const amount =
    params.amount_estimate != null ? Number(params.amount_estimate) : (ctx.value_estimate != null ? Number(ctx.value_estimate) : null);
  const siteAddress = [ctx.account_address, ctx.account_suburb].filter(Boolean).join(', ') || 'See job';
  const description = buildQuoteDescription({
    account_name: ctx.account_name,
    opportunity_summary: params.description || '',
    site_address: siteAddress,
  });

  if (dryRun) {
    log('dry_run', { jobUuid, amount, description: description.slice(0, 80) });
    return { ok: true, dry_run: true, would_create: true };
  }

  let quoteUuid;
  try {
    const client = new ServiceM8Client();
    const created = await client.createQuote(jobUuid, {
      amount: amount != null ? amount : 0,
      note: description,
    });
    quoteUuid = created.uuid;
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    const isNetwork = /timeout|ECONNRESET|ETIMEDOUT|network/i.test(msg);
    log('servicem8 createQuote error', { error: msg });
    return {
      ok: false,
      error: msg,
      error_code: isNetwork ? ERROR_CODES.NETWORK : ERROR_CODES.SERVICEM8_API_ERROR,
    };
  }

  try {
    const ins = await db.query(
      `INSERT INTO quotes (opportunity_id, account_id, contact_id, job_id, servicem8_quote_uuid, amount, status, sent_at, followup_state, followup_due_at, created_via, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, NOW() + INTERVAL '7 days', $9, $10)
       RETURNING id`,
      [
        opportunityId,
        ctx.account_id,
        ctx.contact_id,
        ctx.job_id,
        quoteUuid,
        amount,
        'sent',
        'scheduled',
        CREATED_VIA,
        AUDIT_SOURCE,
      ]
    );
    const quoteId = ins.rows[0].id;

    await writeAudit(db, {
      opportunity_id: opportunityId,
      quote_id: quoteId,
      servicem8_quote_uuid: quoteUuid,
      amount,
      result: 'created',
    });

    await advanceOpportunityStage(opportunityId, 'quote_sent', {
      db,
      created_by: AUDIT_SOURCE,
      log,
    });

    log('created', { opportunity_id: opportunityId, quote_id: quoteId, servicem8_quote_uuid: quoteUuid });
    return {
      ok: true,
      quote_id: quoteId,
      servicem8_quote_uuid: quoteUuid,
      amount,
    };
  } catch (e) {
    log('persist_or_audit error', { error: e.message });
    return {
      ok: false,
      error: `Quote created in ServiceM8 but CRM save failed: ${e.message}. Quote UUID: ${quoteUuid}.`,
      error_code: ERROR_CODES.SERVICEM8_API_ERROR,
      servicem8_quote_uuid: quoteUuid,
    };
  }
}

module.exports = {
  createServiceM8QuoteFromCRM,
  loadOpportunityForQuote,
  getActiveQuoteForOpportunity,
  ERROR_CODES,
  AUDIT_SOURCE,
};
