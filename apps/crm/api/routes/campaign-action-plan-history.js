/**
 * GET /api/dashboard/campaign-action-plan-history
 * Recent review / execution records (read-only).
 */

const router = require('express').Router();
const { listReviewHistory } = require('../../services/campaignActionPlanReview');

router.get('/', async (req, res) => {
  try {
    const rows = await listReviewHistory(req.query.limit);
    res.json({ ok: true, rows });
  } catch (err) {
    console.error('[campaign-action-plan-history]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
