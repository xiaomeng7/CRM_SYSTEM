/**
 * Internal analytics API (funnel + offline conversion queue metrics).
 * Auth: same as admin sync actions — SYNC_SECRET or ADMIN_SECRET when set.
 */

const router = require('express').Router();
const { getConversionPerformance } = require('../../services/conversionPerformance');
const { getAdPerformance } = require('../../services/adPerformanceAnalytics');
const { getAdRecommendations } = require('../../services/adRecommendations');

function requireSyncSecret(req, res, next) {
  const secret = process.env.SYNC_SECRET || process.env.ADMIN_SECRET;
  if (!secret) return next();
  const provided = req.headers['x-sync-secret'] || req.query.sync_secret || req.body?.sync_secret;
  if (provided !== secret) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  return next();
}

// GET /api/analytics/conversion-performance?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
router.get('/conversion-performance', requireSyncSecret, async (req, res) => {
  try {
    const data = await getConversionPerformance({
      date_from: req.query.date_from,
      date_to: req.query.date_to,
    });
    res.json({ ok: true, ...data });
  } catch (e) {
    console.error('[analytics] conversion-performance', e);
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// GET /api/analytics/ad-performance?date_from=&date_to=&product_line=
router.get('/ad-performance', requireSyncSecret, async (req, res) => {
  try {
    const data = await getAdPerformance({
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      product_line: req.query.product_line,
    });
    res.json({ ok: true, ...data });
  } catch (e) {
    if (e.code === 'VALIDATION') {
      return res.status(400).json({ ok: false, error: e.message });
    }
    console.error('[analytics] ad-performance', e);
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// GET /api/analytics/ad-recommendations?date_from=&date_to=&product_line=
router.get('/ad-recommendations', requireSyncSecret, async (req, res) => {
  try {
    const data = await getAdRecommendations({
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      product_line: req.query.product_line,
    });
    res.json({ ok: true, ...data });
  } catch (e) {
    if (e.code === 'VALIDATION') {
      return res.status(400).json({ ok: false, error: e.message });
    }
    console.error('[analytics] ad-recommendations', e);
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

module.exports = router;
