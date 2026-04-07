/**
 * Internal analytics API (funnel + offline conversion queue metrics).
 * Auth: same as admin sync actions — SYNC_SECRET or ADMIN_SECRET when set.
 */

const router = require('express').Router();
const { getConversionPerformance } = require('../../services/conversionPerformance');
const { getAdPerformance } = require('../../services/adPerformanceAnalytics');
const { getAdRecommendations } = require('../../services/adRecommendations');
const { getAdAutoActions } = require('../../services/adAutoActions');
const { getAdScaleActions } = require('../../services/adScaleActions');
const { getLpOptimizationActions } = require('../../services/lpOptimizationActions');
const { recordLpEvent, getLpBehavior } = require('../../services/lpBehavior');
const { getAdLpCombinations } = require('../../services/adLpCombinations');
const { getRevenueBySource } = require('../../services/revenueBySource');

function requireSyncSecret(req, res, next) {
  const secret = process.env.SYNC_SECRET || process.env.ADMIN_SECRET;
  if (!secret) return next();
  const provided = req.headers['x-sync-secret'] || req.query.sync_secret || req.body?.sync_secret;
  if (provided !== secret) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  return next();
}

function lpEventsCors(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  return next();
}

// POST /api/analytics/lp-events — public ingest from static landing pages (no SYNC_SECRET).
router.options('/lp-events', lpEventsCors, (_req, res) => res.sendStatus(204));
router.post('/lp-events', lpEventsCors, async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    await recordLpEvent(req.body || {});
    return res.status(201).json({ ok: true });
  } catch (e) {
    if (e.code === 'VALIDATION') {
      return res.status(400).json({ ok: false, error: e.message });
    }
    if (/relation "lp_events" does not exist/i.test(e.message || '')) {
      return res.status(503).json({ ok: false, error: 'lp_events table not migrated' });
    }
    console.error('[analytics] lp-events', e);
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// GET /api/analytics/ad-lp-combinations?date_from=&date_to=&product_line=
router.get('/ad-lp-combinations', requireSyncSecret, async (req, res) => {
  try {
    const data = await getAdLpCombinations({
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      product_line: req.query.product_line,
    });
    res.json({
      ok: true,
      combinations: data.combinations,
      best_combinations: data.best_combinations,
      mismatches: data.mismatches,
      date_from: data.date_from,
      date_to: data.date_to,
      product_line: data.product_line,
    });
  } catch (e) {
    if (e.code === 'VALIDATION') {
      return res.status(400).json({ ok: false, error: e.message });
    }
    console.error('[analytics] ad-lp-combinations', e);
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// GET /api/analytics/lp-behavior?date_from=&date_to=
router.get('/lp-behavior', requireSyncSecret, async (req, res) => {
  try {
    const rows = await getLpBehavior({
      date_from: req.query.date_from,
      date_to: req.query.date_to,
    });
    res.json({ ok: true, rows });
  } catch (e) {
    if (/relation "lp_events" does not exist/i.test(e.message || '')) {
      return res.json({ ok: true, rows: [] });
    }
    console.error('[analytics] lp-behavior', e);
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

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

// GET /api/analytics/ad-auto-actions?date_from=&date_to=&product_line=
router.get('/ad-auto-actions', requireSyncSecret, async (req, res) => {
  try {
    const data = await getAdAutoActions({
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      product_line: req.query.product_line,
    });
    res.json({ ok: true, ...data });
  } catch (e) {
    if (e.code === 'VALIDATION') {
      return res.status(400).json({ ok: false, error: e.message });
    }
    console.error('[analytics] ad-auto-actions', e);
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// GET /api/analytics/lp-optimization-actions?date_from=&date_to=&product_line=
router.get('/lp-optimization-actions', requireSyncSecret, async (req, res) => {
  try {
    const data = await getLpOptimizationActions({
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      product_line: req.query.product_line,
    });
    res.json({ ok: true, ...data });
  } catch (e) {
    if (e.code === 'VALIDATION') {
      return res.status(400).json({ ok: false, error: e.message });
    }
    console.error('[analytics] lp-optimization-actions', e);
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// GET /api/analytics/ad-scale-actions?date_from=&date_to=&product_line=
router.get('/ad-scale-actions', requireSyncSecret, async (req, res) => {
  try {
    const data = await getAdScaleActions({
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      product_line: req.query.product_line,
    });
    res.json({ ok: true, ...data });
  } catch (e) {
    if (e.code === 'VALIDATION') {
      return res.status(400).json({ ok: false, error: e.message });
    }
    console.error('[analytics] ad-scale-actions', e);
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// GET /api/analytics/revenue-by-source?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
router.get('/revenue-by-source', requireSyncSecret, async (req, res) => {
  try {
    const data = await getRevenueBySource({
      date_from: req.query.date_from,
      date_to: req.query.date_to,
    });
    res.json({ ok: true, ...data });
  } catch (e) {
    if (e.code === 'VALIDATION') {
      return res.status(400).json({ ok: false, error: e.message });
    }
    console.error('[analytics] revenue-by-source', e);
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
