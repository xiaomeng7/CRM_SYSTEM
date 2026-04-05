/**
 * Ad Creative Library API (internal asset store; no Google publish).
 *
 * POST   /api/ads/creatives
 * GET    /api/ads/creatives?status=&platform=&product_line=&limit=
 * PATCH  /api/ads/creatives/:id
 */

const router = require('express').Router();
const {
  createCreative,
  listCreatives,
  patchCreative,
  publishNewCreativeVersion,
} = require('../../services/adCreativeLibrary');
const { listVersionEvents } = require('../../services/adAssetVersioning');

function requireSyncSecret(req, res, next) {
  const secret = process.env.SYNC_SECRET || process.env.ADMIN_SECRET;
  if (!secret) return next();
  const provided = req.headers['x-sync-secret'] || req.query.sync_secret || req.body?.sync_secret;
  if (provided !== secret) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  return next();
}

router.post('/creatives', requireSyncSecret, async (req, res) => {
  try {
    const row = await createCreative(req.body || {});
    res.status(201).json({ ok: true, creative: row });
  } catch (err) {
    if (err.code === 'VALIDATION') {
      return res.status(400).json({ ok: false, error: err.message });
    }
    if (/unique|duplicate/i.test(err.message || '')) {
      return res.status(409).json({ ok: false, error: err.message });
    }
    console.error('[ads/creatives] POST', err);
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// POST /api/ads/creatives/:id/publish-new-version — fork row, bump version (register before PATCH :id)
router.post('/creatives/:id/publish-new-version', requireSyncSecret, async (req, res) => {
  try {
    const out = await publishNewCreativeVersion(req.params.id, req.body || {});
    if (!out) return res.status(404).json({ ok: false, error: 'Not found' });
    res.status(201).json({ ok: true, ...out });
  } catch (err) {
    if (err.code === 'VALIDATION') {
      return res.status(400).json({ ok: false, error: err.message });
    }
    if (/unique|duplicate/i.test(err.message || '')) {
      return res.status(409).json({ ok: false, error: err.message });
    }
    console.error('[ads/creatives] publish-new-version', err);
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

router.get('/creatives', async (req, res) => {
  try {
    const rows = await listCreatives({
      status: req.query.status,
      platform: req.query.platform,
      product_line: req.query.product_line,
      limit: req.query.limit,
    });
    res.json({ ok: true, creatives: rows, count: rows.length });
  } catch (err) {
    console.error('[ads/creatives] GET', err);
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

router.patch('/creatives/:id', requireSyncSecret, async (req, res) => {
  try {
    const row = await patchCreative(req.params.id, req.body || {});
    if (!row) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, creative: row });
  } catch (err) {
    if (err.code === 'VALIDATION') {
      return res.status(400).json({ ok: false, error: err.message });
    }
    if (err.code === 'ACTIVE_IMMUTABLE') {
      return res.status(409).json({ ok: false, error: err.message, code: err.code });
    }
    console.error('[ads/creatives] PATCH', err);
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// GET /api/ads/version-events?object_type=&old_id=&new_id=&limit=
router.get('/version-events', requireSyncSecret, async (req, res) => {
  try {
    const events = await listVersionEvents({
      object_type: req.query.object_type,
      old_id: req.query.old_id,
      new_id: req.query.new_id,
      limit: req.query.limit,
    });
    res.json({ ok: true, events, count: events.length });
  } catch (err) {
    if (err.code === 'VALIDATION') {
      return res.status(400).json({ ok: false, error: err.message });
    }
    console.error('[ads/version-events]', err);
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

module.exports = router;
