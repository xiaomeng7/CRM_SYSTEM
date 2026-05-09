const router = require('express').Router();
const seoKeywords = require('../../services/seoKeywords');
const seoTasks = require('../../services/seoTasks');

function getActor(req) {
  return (
    (typeof req.body?.actor === 'string' && req.body.actor.trim()) ||
    (typeof req.headers['x-actor'] === 'string' && req.headers['x-actor'].trim()) ||
    'seo-control-center'
  );
}

function getRole(req) {
  return (
    (typeof req.body?.role === 'string' && req.body.role.trim().toLowerCase()) ||
    (typeof req.headers['x-role'] === 'string' && req.headers['x-role'].trim().toLowerCase()) ||
    ''
  );
}

function requireApprovalRole(req, res, next) {
  const role = getRole(req);
  if (!['owner', 'admin'].includes(role)) {
    return res.status(403).json({ ok: false, error: 'Forbidden: owner/admin role required' });
  }
  return next();
}

function handleError(res, err) {
  if (err?.code === 'VALIDATION') {
    return res.status(400).json({ ok: false, error: err.message });
  }
  if (err?.code === 'NOT_FOUND') {
    return res.status(404).json({ ok: false, error: err.message });
  }
  if (String(err?.message || '').includes('duplicate key value')) {
    return res.status(409).json({ ok: false, error: 'Resource already exists' });
  }
  console.error('[seo api]', err);
  return res.status(500).json({ ok: false, error: err?.message || 'Internal server error' });
}

// ---------------- Opportunities ----------------
router.get('/opportunities', async (req, res) => {
  try {
    const items = await seoKeywords.list({
      status: req.query.status,
      intent: req.query.intent,
      priority: req.query.priority,
      keyword: req.query.keyword,
    });
    return res.json({ ok: true, items });
  } catch (err) {
    return handleError(res, err);
  }
});

router.post('/opportunities', async (req, res) => {
  try {
    const item = await seoKeywords.create({
      ...req.body,
      actor: getActor(req),
    });
    return res.status(201).json({ ok: true, item });
  } catch (err) {
    return handleError(res, err);
  }
});

router.patch('/opportunities/:id', async (req, res) => {
  try {
    const item = await seoKeywords.patch(req.params.id, req.body || {});
    if (!item) return res.status(404).json({ ok: false, error: 'Not found' });
    return res.json({ ok: true, item });
  } catch (err) {
    return handleError(res, err);
  }
});

// ---------------- Tasks ----------------
router.get('/tasks', async (req, res) => {
  try {
    const items = await seoTasks.list({
      week_start_date: req.query.week_start_date,
      status: req.query.status,
      priority: req.query.priority,
      intent: req.query.intent,
      owner_id: req.query.owner_id,
    });
    return res.json({ ok: true, items });
  } catch (err) {
    return handleError(res, err);
  }
});

router.post('/tasks', async (req, res) => {
  try {
    const ownerId = req.body?.owner_id || req.headers['x-owner-id'] || null;
    const item = await seoTasks.create({
      ...req.body,
      owner_id: ownerId,
      actor: getActor(req),
    });
    return res.status(201).json({ ok: true, item });
  } catch (err) {
    return handleError(res, err);
  }
});

router.patch('/tasks/:id', async (req, res) => {
  try {
    const item = await seoTasks.patch(req.params.id, req.body || {});
    if (!item) return res.status(404).json({ ok: false, error: 'Not found' });
    return res.json({ ok: true, item });
  } catch (err) {
    return handleError(res, err);
  }
});

router.post('/tasks/:id/approve', requireApprovalRole, async (req, res) => {
  try {
    const action = typeof req.body?.action === 'string' ? req.body.action.trim().toLowerCase() : '';
    const item = await seoTasks.approve(req.params.id, action, getActor(req));
    if (!item) return res.status(404).json({ ok: false, error: 'Not found' });
    return res.json({ ok: true, item });
  } catch (err) {
    return handleError(res, err);
  }
});

router.post('/tasks/:id/status', async (req, res) => {
  try {
    const status = typeof req.body?.status === 'string' ? req.body.status.trim() : '';
    const item = await seoTasks.changeStatus(req.params.id, status);
    if (!item) return res.status(404).json({ ok: false, error: 'Not found' });
    return res.json({ ok: true, item });
  } catch (err) {
    return handleError(res, err);
  }
});

module.exports = router;

