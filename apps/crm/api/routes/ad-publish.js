/**
 * POST /api/ad-publish/google — run Google Ads publisher on ready queue rows.
 */

const router = require('express').Router();
const { publishNextReadyAd } = require('../../services/googleAdsPublisher');

router.post('/google', async (req, res) => {
  try {
    const body = req.body || {};
    const limit =
      body.limit != null
        ? parseInt(String(body.limit), 10)
        : req.query.limit != null
          ? parseInt(String(req.query.limit), 10)
          : 1;

    const result = await publishNextReadyAd({ limit });
    res.json({
      ok: true,
      processed: result.processed,
      success: result.success,
      failed: result.failed,
    });
  } catch (err) {
    console.error('[ad-publish]', err);
    res.status(500).json({
      ok: false,
      error: err.message || String(err),
    });
  }
});

module.exports = router;
