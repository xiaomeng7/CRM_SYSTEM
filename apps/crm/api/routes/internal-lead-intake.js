/**
 * Internal-only lead creation (non-ad / manual intake).
 * POST /api/internal/create-lead-with-job
 */

const router = require('express').Router();
const { createLeadWithJobFromInternal } = require('../../services/internalLeadIntake');

function requireSyncSecret(req, res, next) {
  const secret = process.env.SYNC_SECRET || process.env.ADMIN_SECRET;
  if (!secret) return next();
  const provided = req.headers['x-sync-secret'] || req.query.sync_secret || req.body?.sync_secret;
  if (provided !== secret) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  return next();
}

router.post('/create-lead-with-job', requireSyncSecret, async (req, res) => {
  try {
    const out = await createLeadWithJobFromInternal(req.body || {});
    if (!out.ok) {
      const status = out.error_code === 'SERVICEM8_JOB' ? 502 : 400;
      return res.status(status).json(out);
    }
    return res.status(201).json(out);
  } catch (e) {
    if (e.code === 'VALIDATION') {
      return res.status(400).json({ ok: false, error: e.message });
    }
    console.error('[internal] create-lead-with-job', e);
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

module.exports = router;
