/**
 * Ad Execution Engine v1 — enqueue, publish queue (OpenClaw-ready), completion callback.
 *
 * POST /api/ad-execution/enqueue
 * GET  /api/ad-execution/queue?limit=&status=pending|ready   — pending+ready, FIFO (oldest first)
 * POST /api/ad-execution/complete  — executed | failed + notes
 * POST /api/ad-execution/mark-ready   — pending → ready (+ optional notes)
 * POST /api/ad-execution/mark-pending — ready → pending (+ optional notes)
 *
 * Legacy / admin: GET /api/ad-execution/queue?all=1&status=... — broader filters, DESC, SELECT *
 */

const router = require('express').Router();
const {
  enqueueApprovedVariants,
  listExecutionQueue,
  listPublishQueue,
  completePublishTask,
  markQueueReady,
  markQueuePending,
} = require('../../services/adExecutionEngine');
const { pool } = require('../../lib/db');

function isUuid(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim());
}

router.post('/enqueue', async (req, res) => {
  try {
    const { enqueued, skipped, errors } = await enqueueApprovedVariants();
    res.json({ ok: true, enqueued, skipped, errors });
  } catch (err) {
    console.error('[ad-execution]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/queue', async (req, res) => {
  try {
    const include_all = req.query.all === '1' || req.query.all === 'true';
    const limit = req.query.limit;

    if (include_all) {
      const status = req.query.status != null ? req.query.status : undefined;
      const rows = await listExecutionQueue({ status, include_all, limit });
      return res.json({ ok: true, queue: rows });
    }

    const status =
      req.query.status != null && String(req.query.status).trim() !== ''
        ? String(req.query.status).trim().toLowerCase()
        : undefined;
    try {
      const rows = await listPublishQueue({ status, limit });
      return res.json({ ok: true, queue: rows });
    } catch (e) {
      if (/status filter must be/i.test(e.message || '')) {
        return res.status(400).json({ ok: false, error: e.message });
      }
      throw e;
    }
  } catch (err) {
    console.error('[ad-execution]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/complete', async (req, res) => {
  try {
    const body = req.body || {};
    const id = body.id != null ? String(body.id).trim() : '';
    const status = body.status != null ? String(body.status).trim().toLowerCase() : '';

    if (!isUuid(id)) {
      return res.status(400).json({ ok: false, error: 'id must be a valid UUID (queue row id)' });
    }
    if (status !== 'executed' && status !== 'failed') {
      return res.status(400).json({ ok: false, error: 'status must be executed or failed' });
    }

    const row = await completePublishTask(pool, {
      id,
      status,
      execution_notes: body.execution_notes,
    });

    if (!row) {
      return res.status(404).json({ ok: false, error: 'queue item not found' });
    }

    res.json({ ok: true, row });
  } catch (err) {
    console.error('[ad-execution]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

function handleMarkError(res, err) {
  if (err.code === 'NOT_FOUND') {
    return res.status(404).json({ ok: false, error: err.message });
  }
  if (err.code === 'INVALID_STATE') {
    return res.status(400).json({ ok: false, error: err.message });
  }
  console.error('[ad-execution]', err);
  return res.status(500).json({ ok: false, error: err.message });
}

router.post('/mark-ready', async (req, res) => {
  try {
    const body = req.body || {};
    const id = body.id != null ? String(body.id).trim() : '';
    if (!isUuid(id)) {
      return res.status(400).json({ ok: false, error: 'id must be a valid UUID (queue row id)' });
    }
    const row = await markQueueReady(id, body.notes, pool);
    res.json({ ok: true, row });
  } catch (err) {
    handleMarkError(res, err);
  }
});

router.post('/mark-pending', async (req, res) => {
  try {
    const body = req.body || {};
    const id = body.id != null ? String(body.id).trim() : '';
    if (!isUuid(id)) {
      return res.status(400).json({ ok: false, error: 'id must be a valid UUID (queue row id)' });
    }
    const row = await markQueuePending(id, body.notes, pool);
    res.json({ ok: true, row });
  } catch (err) {
    handleMarkError(res, err);
  }
});

module.exports = router;
