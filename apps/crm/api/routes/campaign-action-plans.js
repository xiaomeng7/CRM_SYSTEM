/**
 * GET  /api/dashboard/campaign-action-plans
 * POST /api/dashboard/campaign-action-plans/review
 *   Body may include optional `details` (object) stored for GET .../campaign-action-plan-ready.
 */

const router = require('express').Router();
const { getCampaignActionPlans } = require('../../services/campaignActionPlanEngine');
const { submitReview } = require('../../services/campaignActionPlanReview');

router.get('/', async (req, res) => {
  try {
    const { plans, source } = await getCampaignActionPlans();
    res.json({ ok: true, plans, source });
  } catch (err) {
    console.error('[campaign-action-plans]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/review', async (req, res) => {
  try {
    const record = await submitReview(req.body || {});
    res.status(201).json({ ok: true, record });
  } catch (err) {
    const code = err.code;
    if (code === 'VALIDATION' || code === 'BAD_CAMPAIGN_KEY') {
      return res.status(400).json({ ok: false, error: err.message });
    }
    if (code === 'NOT_FOUND') {
      return res.status(404).json({ ok: false, error: err.message });
    }
    if (code === 'AMBIGUOUS') {
      return res.status(409).json({ ok: false, error: err.message });
    }
    if (code === 'MIGRATION_REQUIRED') {
      return res.status(503).json({ ok: false, error: err.message });
    }
    console.error('[campaign-action-plans/review]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
