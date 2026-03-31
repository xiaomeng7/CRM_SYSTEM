/**
 * GET /api/dashboard/campaign-action-plan-ready
 * Read-only queue: approved actions for OpenClaw / executors (no side effects).
 */

const router = require('express').Router();
const { listApprovedReadyQueue } = require('../../services/campaignActionPlanReview');

router.get('/', async (req, res) => {
  try {
    const rows = await listApprovedReadyQueue();
    res.json({ ok: true, rows });
  } catch (err) {
    console.error('[campaign-action-plan-ready]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
