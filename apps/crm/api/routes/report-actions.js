/**
 * POST /api/report-actions — client report CTAs (repair quote / book electrician)
 * Body: { inspection_id: string, action: 'request_quote' | 'book_job' }
 */

const router = require('express').Router();
const { pool } = require('../../lib/db');
const opportunities = require('../../services/opportunities');
const { createServiceM8JobFromCRM, ERROR_CODES } = require('../../services/servicem8-create-job');

function isValidUuid(s) {
  if (!s || typeof s !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
}

function logLine(event, extra = {}) {
  console.log(
    '[report-actions]',
    JSON.stringify({ ts: new Date().toISOString(), event, ...extra })
  );
}

async function findPrePurchaseInspection(rawId) {
  const id = String(rawId || '').trim();
  if (!id) return null;
  if (isValidUuid(id)) {
    const byPk = await pool.query(
      `SELECT id, opportunity_id, contact_phone, job_number, servicem8_job_uuid, review_inspection_id
       FROM pre_purchase_inspections WHERE id = $1::uuid LIMIT 1`,
      [id]
    );
    if (byPk.rows[0]) return byPk.rows[0];
  }
  const byReview = await pool.query(
    `SELECT id, opportunity_id, contact_phone, job_number, servicem8_job_uuid, review_inspection_id
     FROM pre_purchase_inspections WHERE review_inspection_id = $1 LIMIT 1`,
    [id]
  );
  return byReview.rows[0] || null;
}

async function resolveAccountContactForInspection(insp) {
  if (insp.opportunity_id) {
    const o = await pool.query(
      `SELECT account_id, contact_id FROM opportunities WHERE id = $1::uuid LIMIT 1`,
      [insp.opportunity_id]
    );
    if (o.rows[0]) return o.rows[0];
  }
  if (insp.job_number) {
    const j = await pool.query(
      `SELECT account_id, contact_id FROM jobs WHERE job_number = $1 LIMIT 1`,
      [String(insp.job_number).trim()]
    );
    if (j.rows[0]) return j.rows[0];
  }
  return { account_id: null, contact_id: null };
}

async function findExistingQuoteOpportunity(inspectionPk) {
  const r = await pool.query(
    `SELECT id FROM opportunities
     WHERE metadata->>'source' = 'report'
       AND metadata->>'pre_purchase_inspection_id' = $1
       AND metadata->>'report_cta' = 'request_quote'
     ORDER BY created_at DESC
     LIMIT 1`,
    [String(inspectionPk)]
  );
  return r.rows[0]?.id || null;
}

router.options('/', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.status(204).end();
});

router.post('/', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const body = req.body || {};
  const inspection_id = body.inspection_id != null ? String(body.inspection_id).trim() : '';
  const action = body.action != null ? String(body.action).trim() : '';

  logLine('request', { inspection_id, action, ip: req.ip });

  if (!inspection_id || !action) {
    logLine('validation_error', { reason: 'missing_fields' });
    return res.status(400).json({ ok: false, error: 'inspection_id and action are required' });
  }
  if (action !== 'request_quote' && action !== 'book_job') {
    logLine('validation_error', { reason: 'invalid_action', action });
    return res.status(400).json({ ok: false, error: 'Invalid action' });
  }

  try {
    const insp = await findPrePurchaseInspection(inspection_id);
    if (!insp) {
      logLine('not_found', { inspection_id });
      return res.status(404).json({ ok: false, error: 'Inspection not found' });
    }

    const inspectionPk = String(insp.id);

    if (action === 'request_quote') {
      const existingOpp = await findExistingQuoteOpportunity(inspectionPk);
      if (existingOpp) {
        logLine('request_quote_idempotent', { opportunity_id: existingOpp, inspection_id: inspectionPk });
        return res.status(200).json({ ok: true, opportunity_id: existingOpp, idempotent: true });
      }

      const { account_id, contact_id } = await resolveAccountContactForInspection(insp);
      const row = await opportunities.create({
        account_id,
        contact_id,
        stage: 'new_inquiry',
        created_by: 'report-actions',
        metadata: {
          source: 'report',
          pre_purchase_inspection_id: inspectionPk,
          report_cta: 'request_quote',
          client_inspection_ref: inspection_id,
        },
      });

      await pool.query(
        `UPDATE pre_purchase_inspections
         SET opportunity_id = $1, updated_at = NOW()
         WHERE id = $2::uuid AND opportunity_id IS NULL`,
        [row.id, inspectionPk]
      );

      logLine('request_quote_created', { opportunity_id: row.id, inspection_id: inspectionPk });
      return res.status(201).json({ ok: true, opportunity_id: row.id });
    }

    // book_job
    let oppId = insp.opportunity_id && isValidUuid(String(insp.opportunity_id))
      ? String(insp.opportunity_id)
      : null;
    if (!oppId) {
      const alt = await pool.query(
        `SELECT id FROM opportunities
         WHERE metadata->>'pre_purchase_inspection_id' = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [inspectionPk]
      );
      oppId = alt.rows[0]?.id || null;
    }
    if (!oppId) {
      const { account_id, contact_id } = await resolveAccountContactForInspection(insp);
      if (!account_id) {
        logLine('book_job_no_account', { inspection_id: inspectionPk });
        return res.status(422).json({
          ok: false,
          error: 'No CRM account linked to this inspection; use Request Repair Quote first or link a job.',
        });
      }
      const row = await opportunities.create({
        account_id,
        contact_id,
        stage: 'new_inquiry',
        created_by: 'report-actions',
        metadata: {
          source: 'report',
          pre_purchase_inspection_id: inspectionPk,
          report_cta: 'book_job_bootstrap',
          client_inspection_ref: inspection_id,
        },
      });
      oppId = row.id;
      await pool.query(
        `UPDATE pre_purchase_inspections
         SET opportunity_id = $1, updated_at = NOW()
         WHERE id = $2::uuid AND opportunity_id IS NULL`,
        [oppId, inspectionPk]
      );
    }

    const jobDescription = `Repair from inspection ${inspection_id}`;
    const result = await createServiceM8JobFromCRM(
      {
        opportunity_id: oppId,
        description: jobDescription,
        create_reason: 'report_actions_book_job',
      },
      { log: (msg, extra) => logLine('servicem8', { msg, ...(extra || {}) }) }
    );

    if (!result.ok) {
      const code = result.error_code;
      logLine('book_job_failed', { opportunity_id: oppId, code, error: result.error });
      if (code === ERROR_CODES.OPPORTUNITY_NOT_FOUND) return res.status(404).json({ ok: false, error: result.error });
      if (code === ERROR_CODES.ACCOUNT_NOT_MAPPED || code === ERROR_CODES.VALIDATION) {
        return res.status(400).json({ ok: false, error: result.error, code });
      }
      return res.status(502).json({ ok: false, error: result.error, code: code || 'servicem8_error' });
    }

    logLine('book_job_ok', {
      opportunity_id: oppId,
      job_uuid: result.job_uuid,
      job_id: result.job_id,
      already_created: result.already_created,
    });
    const status = result.already_created ? 200 : 201;
    return res.status(status).json({ ok: true, ...result });
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    logLine('error', { message: msg });
    if (/column.*metadata/i.test(msg)) {
      return res.status(503).json({
        ok: false,
        error: 'Server not migrated: opportunities.metadata missing. Run migration 063.',
      });
    }
    return res.status(500).json({ ok: false, error: msg });
  }
});

module.exports = router;
