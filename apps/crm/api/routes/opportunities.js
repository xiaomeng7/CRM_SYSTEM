/**
 * Opportunities API routes
 */

const router = require('express').Router();
const opportunities = require('../../services/opportunities');
const { createServiceM8JobFromCRM, ERROR_CODES } = require('../../services/servicem8-create-job');
const { createServiceM8QuoteFromCRM, ERROR_CODES: QUOTE_ERROR_CODES } = require('../../services/servicem8-create-quote');
const { ensurePrimaryJobForOpportunity } = require('../../services/opportunityAutoConvertToJob');

router.post('/', async (req, res) => {
  try {
    const row = await opportunities.create(req.body);
    res.status(201).json(row);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const rows = await opportunities.list({
      stage: req.query.stage,
      account_id: req.query.account_id,
      limit: parseInt(req.query.limit, 10) || 100,
      offset: parseInt(req.query.offset, 10) || 0,
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await opportunities.getById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/stage', async (req, res) => {
  try {
    const { stage, stage_locked, created_by } = req.body || {};
    if (!stage) return res.status(400).json({ error: 'stage is required' });
    const row = await opportunities.updateStage(req.params.id, stage, created_by, { stage_locked });
    if (!row) return res.status(404).json({ error: 'Not found' });

    // Opportunity Auto Convert → Job: when stage becomes Inspection Booked or Qualified, ensure primary job
    let jobAuto = null;
    if (row && ['site_visit_booked', 'qualified'].includes(row.stage)) {
      try {
        jobAuto = await ensurePrimaryJobForOpportunity(row.id, {
          log: (msg, extra) => (extra ? console.log(msg, extra) : console.log(msg)),
        });
      } catch (e) {
        console.error('opportunity auto-convert to job:', e);
        jobAuto = { ran: true, created: false, error: e.message };
      }
    }

    const payload = { ...row };
    if (jobAuto) payload._job_auto = jobAuto;
    res.json(payload);
  } catch (err) {
    if (err.message.includes('Invalid stage')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/opportunities/:id/create-servicem8-job
 * Phase 2A: Create ServiceM8 job from opportunity. Idempotent (one job per opportunity).
 * Body: { description?, address_override?, create_reason? }
 */
router.post('/:id/create-servicem8-job', async (req, res) => {
  try {
    const opportunityId = req.params.id;
    const body = req.body || {};
    const result = await createServiceM8JobFromCRM(
      {
        opportunity_id: opportunityId,
        description: body.description,
        address_override: body.address_override,
        create_reason: body.create_reason,
      },
      { log: (msg, extra) => (extra ? console.log(msg, extra) : console.log(msg)) }
    );

    if (!result.ok) {
      const code = result.error_code;
      if (code === ERROR_CODES.OPPORTUNITY_NOT_FOUND) return res.status(404).json({ error: result.error, code });
      if (code === ERROR_CODES.ACCOUNT_NOT_MAPPED || code === ERROR_CODES.VALIDATION) {
        return res.status(400).json({ error: result.error, code });
      }
      return res.status(502).json({ error: result.error, code: code || 'servicem8_error' });
    }

    if (result.already_created) return res.status(200).json(result);
    return res.status(201).json(result);
  } catch (err) {
    console.error('create-servicem8-job error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/opportunities/:id/create-quote
 * Phase 2B: Create ServiceM8 quote from opportunity. Idempotent (one active quote per opportunity).
 * Body: { amount_estimate?, description? }
 */
router.post('/:id/create-quote', async (req, res) => {
  try {
    const opportunityId = req.params.id;
    const body = req.body || {};
    const result = await createServiceM8QuoteFromCRM(
      {
        opportunity_id: opportunityId,
        amount_estimate: body.amount_estimate,
        description: body.description,
      },
      { log: (msg, extra) => (extra ? console.log(msg, extra) : console.log(msg)) }
    );

    if (!result.ok) {
      const code = result.error_code;
      if (code === QUOTE_ERROR_CODES.OPPORTUNITY_NOT_FOUND) return res.status(404).json({ error: result.error, code });
      if (code === QUOTE_ERROR_CODES.JOB_UUID_MISSING || code === QUOTE_ERROR_CODES.VALIDATION) {
        return res.status(400).json({ error: result.error, code });
      }
      return res.status(502).json({ error: result.error, code: code || 'servicem8_error' });
    }

    if (result.already_created) return res.status(200).json(result);
    return res.status(201).json(result);
  } catch (err) {
    console.error('create-quote error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
