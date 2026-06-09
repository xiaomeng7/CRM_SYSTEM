/**
 * Operational event actions API (PR7D) — suggestions only, no execution.
 */

const router = require('express').Router();
const { listActions, listActionsForEvent, updateActionStatus } = require('../../services/operations/actionService');
const { generateEventActions } = require('../../services/operations/generateEventActions');
const { getOperationalEventById } = require('../../services/operations/eventService');

function safeErrorMessage(err) {
  if (!err) return 'Request failed';
  const code = err.code;
  if (code === 'INVALID_STATUS' || code === 'INVALID_INPUT') return err.message;
  if (code === 'NOT_FOUND') return err.message || 'Not found';
  const msg = String(err.message || err);
  if (/relation .* does not exist/i.test(msg)) {
    return 'Database migration required (068_operational_event_actions)';
  }
  if (/password|connection|ECONNREFUSED/i.test(msg)) {
    return 'Database unavailable';
  }
  return 'Request failed';
}

function statusFromError(err) {
  const code = err.code;
  if (code === 'INVALID_STATUS' || code === 'INVALID_INPUT') return 400;
  if (code === 'NOT_FOUND') return 404;
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

router.get('/', async (req, res) => {
  try {
    const actions = await listActions({
      event_id: req.query.event_id,
      status: req.query.status,
      limit: req.query.limit,
    });
    res.json({ ok: true, count: actions.length, actions });
  } catch (err) {
    res.status(statusFromError(err)).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.get('/:eventId', async (req, res) => {
  try {
    const event = await getOperationalEventById(req.params.eventId);
    if (!event) {
      return res.status(404).json({ ok: false, error: 'Event not found' });
    }
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    let result;
    if (refresh || !(await listActionsForEvent(event.id)).length) {
      result = await generateEventActions(event);
    } else {
      result = {
        event_id: event.id,
        event_type: event.event_type,
        generated: 0,
        actions: await listActionsForEvent(event.id),
      };
    }
    res.json({
      ok: true,
      event_id: result.event_id,
      event_type: result.event_type,
      generated: result.generated,
      actions: result.actions,
    });
  } catch (err) {
    res.status(statusFromError(err)).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.post('/:id/status', async (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  try {
    const status = req.body?.status;
    const action = await updateActionStatus(req.params.id, status);
    res.json({ ok: true, action });
  } catch (err) {
    res.status(statusFromError(err)).json({ ok: false, error: safeErrorMessage(err) });
  }
});

module.exports = router;
