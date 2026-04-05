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
  getVersionById,
  patchVersion,
  publishNewLandingVersion,
  generateOptimizedLandingPageCopy,
} = require('../../services/landingPageVersionLibrary');

function trimBody(s) {
  if (s == null) return '';
  return String(s).trim();
}

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

// POST /api/ads/landing-pages/generate-optimized-copy — must be before /landing-pages/:id routes
router.post('/landing-pages/generate-optimized-copy', requireSyncSecret, async (req, res) => {
  try {
    const b = req.body || {};
    const refId = trimBody(b.reference_landing_page_id);
    const srcId = trimBody(b.source_landing_page_id);
    if (!refId || !srcId) {
      return res.status(400).json({
        ok: false,
        error: 'reference_landing_page_id and source_landing_page_id are required',
      });
    }
    const ref = await getVersionById(refId);
    const src = await getVersionById(srcId);
    if (!ref || !src) {
      return res.status(404).json({ ok: false, error: 'Landing page version not found' });
    }
    const pl = trimBody(b.product_line || src.product_line || ref.product_line).toLowerCase();
    const dropOff = trimBody(b.drop_off_stage || 'ok').toLowerCase() || 'ok';
    const copy = generateOptimizedLandingPageCopy({
      product_line: pl,
      drop_off_stage: dropOff,
      better_version: ref,
      current_version: src,
    });
    res.json({
      ok: true,
      headline: copy.headline,
      subheadline: copy.subheadline,
      cta_text: copy.cta_text,
      drop_off_stage: dropOff,
      reference_version: ref.version,
      source_version: src.version,
    });
  } catch (err) {
    console.error('[ads/landing-pages] generate-optimized-copy', err);
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
