/**
 * Operational events API (PR7A) — read + resolve only; no auto-create.
 */

const router = require('express').Router();
const {
  listOperationalEvents,
  listOperationalEventsByAttention,
  getOperationalEventsSummary,
  normalizeListFilters,
} = require('../../services/operations/eventService');
const { resolveOperationalEvent } = require('../../services/operations/resolveOperationalEvent');

function safeErrorMessage(err) {
  if (!err) return 'Request failed';
  const code = err.code;
  if (code === 'INVALID_STATUS' || code === 'INVALID_SEVERITY' || code === 'INVALID_INPUT') {
    return err.message;
  }
  if (code === 'NOT_FOUND') return 'Event not found';
  if (code === 'NOT_OPEN') return err.message;
  const msg = String(err.message || err);
  if (/relation .* does not exist/i.test(msg)) {
    return 'Database migration required (066_operational_events)';
  }
  if (/password|connection|ECONNREFUSED/i.test(msg)) {
    return 'Database unavailable';
  }
  return 'Request failed';
}

function statusFromError(err) {
  const code = err.code;
  if (code === 'INVALID_STATUS' || code === 'INVALID_SEVERITY' || code === 'INVALID_INPUT') {
    return 400;
  }
  if (code === 'NOT_FOUND' || code === 'NOT_OPEN') return 404;
  return 500;
}

function requireAdminSecret(req, res) {
  const secret = process.env.ADMIN_SECRET || process.env.SYNC_SECRET;
  if (!secret) return true;
  const provided =
    req.headers['x-admin-secret'] ||
    req.headers['x-sync-secret'] ||
    req.body?.admin_secret ||
    req.body?.sync_secret;
  if (provided !== secret) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}

router.get('/summary', async (req, res) => {
  try {
    const summary = await getOperationalEventsSummary();
    res.json({ ok: true, ...summary });
  } catch (err) {
    res.status(statusFromError(err)).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.get('/attention', async (req, res) => {
  try {
    const filters = normalizeListFilters({
      status: req.query.status || 'open',
      severity: req.query.severity,
      event_type: req.query.event_type,
      limit: req.query.limit,
    });
    const events = await listOperationalEventsByAttention(filters);
    res.json({
      ok: true,
      status: filters.status,
      count: events.length,
      events,
    });
  } catch (err) {
    res.status(statusFromError(err)).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.get('/', async (req, res) => {
  try {
    const filters = normalizeListFilters({
      status: req.query.status,
      severity: req.query.severity,
      event_type: req.query.event_type,
      limit: req.query.limit,
    });
    const events = await listOperationalEvents(filters);
    res.json({
      ok: true,
      status: filters.status,
      count: events.length,
      events,
    });
  } catch (err) {
    res.status(statusFromError(err)).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.post('/:id/resolve', async (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  try {
    const status = req.body?.status || 'resolved';
    const event = await resolveOperationalEvent(req.params.id, { status });
    res.json({ ok: true, event });
  } catch (err) {
    res.status(statusFromError(err)).json({ ok: false, error: safeErrorMessage(err) });
  }
});

module.exports = router;
