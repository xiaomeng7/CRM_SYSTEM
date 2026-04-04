/**
 * Landing Page Version Library API (registry only).
 *
 * POST   /api/ads/landing-pages
 * GET    /api/ads/landing-pages?status=&product_line=&version=&route_path=&limit=
 * PATCH  /api/ads/landing-pages/:id
 */

const router = require('express').Router();
const {
  createVersion,
  listVersions,
  patchVersion,
  publishNewLandingVersion,
} = require('../../services/landingPageVersionLibrary');

function requireSyncSecret(req, res, next) {
  const secret = process.env.SYNC_SECRET || process.env.ADMIN_SECRET;
  if (!secret) return next();
  const provided = req.headers['x-sync-secret'] || req.query.sync_secret || req.body?.sync_secret;
  if (provided !== secret) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  return next();
}

router.post('/landing-pages', requireSyncSecret, async (req, res) => {
  try {
    const row = await createVersion(req.body || {});
    res.status(201).json({ ok: true, landing_page_version: row });
  } catch (err) {
    if (err.code === 'VALIDATION') {
      return res.status(400).json({ ok: false, error: err.message });
    }
    if (/unique|duplicate/i.test(err.message || '')) {
      return res.status(409).json({ ok: false, error: err.message });
    }
    console.error('[ads/landing-pages] POST', err);
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

router.post('/landing-pages/:id/publish-new-version', requireSyncSecret, async (req, res) => {
  try {
    const out = await publishNewLandingVersion(req.params.id, req.body || {});
    if (!out) return res.status(404).json({ ok: false, error: 'Not found' });
    res.status(201).json({ ok: true, ...out });
  } catch (err) {
    if (err.code === 'VALIDATION' || err.code === 'DUPLICATE_VERSION') {
      const status = err.code === 'DUPLICATE_VERSION' ? 409 : 400;
      return res.status(status).json({ ok: false, error: err.message, code: err.code });
    }
    if (/unique|duplicate/i.test(err.message || '')) {
      return res.status(409).json({ ok: false, error: err.message });
    }
    console.error('[ads/landing-pages] publish-new-version', err);
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

router.get('/landing-pages', async (req, res) => {
  try {
    const rows = await listVersions({
      status: req.query.status,
      product_line: req.query.product_line,
      version: req.query.version,
      route_path: req.query.route_path,
      limit: req.query.limit,
    });
    res.json({ ok: true, landing_page_versions: rows, count: rows.length });
  } catch (err) {
    console.error('[ads/landing-pages] GET', err);
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

router.patch('/landing-pages/:id', requireSyncSecret, async (req, res) => {
  try {
    const row = await patchVersion(req.params.id, req.body || {});
    if (!row) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, landing_page_version: row });
  } catch (err) {
    if (err.code === 'VALIDATION') {
      return res.status(400).json({ ok: false, error: err.message });
    }
    if (err.code === 'ACTIVE_IMMUTABLE') {
      return res.status(409).json({ ok: false, error: err.message, code: err.code });
    }
    if (/unique|duplicate/i.test(err.message || '')) {
      return res.status(409).json({ ok: false, error: err.message });
    }
    console.error('[ads/landing-pages] PATCH', err);
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

module.exports = router;
