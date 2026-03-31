/**
 * GET /api/dashboard/campaign-roi-insights
 * AI (or rule-based) narrative on v_campaign_roi_summary.
 */

const router = require('express').Router();
const { getCampaignRoiInsights } = require('../../services/campaignRoiInsights');

router.get('/', async (req, res) => {
  try {
    const { summary, insights } = await getCampaignRoiInsights();
    res.json({ ok: true, summary, insights });
  } catch (err) {
    console.error('[campaign-roi-insights]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
