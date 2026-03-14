/**
 * Reactivation SMS Queue API
 * POST /api/reactivation/queue/add - add single contact to preview queue (dashboard)
 * POST /api/reactivation/queue/generate - generate preview queue
 * GET /api/reactivation/queue - list queue items
 * POST /api/reactivation/queue/send - send batch
 * PATCH /api/reactivation/queue/:id/message - update single message
 * POST /api/reactivation/queue/apply-template - apply template to batch
 */

const router = require('express').Router();
const { generateQueue, listQueue, sendBatch, addToQueue, updateMessage, applyTemplate } = require('../../services/reactivation-sms-engine');

router.post('/add', async (req, res) => {
  try {
    const { contact_id, source = 'dashboard' } = req.body || {};
    if (!contact_id) return res.status(400).json({ error: 'contact_id is required' });
    const result = await addToQueue(contact_id, source);
    res.json(result);
  } catch (err) {
    console.error('POST /api/reactivation/queue/add error:', err);
    res.status(400).json({ error: err.message });
  }
});

router.post('/generate', async (req, res) => {
  try {
    const { limit = 20, min_priority_score: minPriorityScore } = req.body || {};
    const result = await generateQueue({ limit, min_priority_score: minPriorityScore });
    res.json(result);
  } catch (err) {
    console.error('POST /api/reactivation/queue/generate error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);
    const r = await require('../../lib/db').pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('queued','preview')) AS queued_preview,
         COUNT(*) FILTER (WHERE status = 'queued') AS queued,
         COUNT(*) FILTER (WHERE status = 'preview') AS preview,
         COUNT(*) FILTER (WHERE status = 'sent' AND sent_at >= $1 AND sent_at < $2) AS sent_today,
         COUNT(*) FILTER (WHERE status = 'failed') AS failed
       FROM reactivation_sms_queue`,
      [todayStart, todayEnd]
    );
    const row = r.rows[0] || {};
    res.json({
      queued: Number(row.queued ?? 0),
      preview: Number(row.preview ?? 0),
      queued_preview: Number(row.queued_preview ?? 0),
      sent_today: Number(row.sent_today ?? 0),
      failed: Number(row.failed ?? 0),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const status = req.query.status;
    const batch_id = req.query.batch_id;
    const limit = req.query.limit;
    const result = await listQueue({ status, batch_id, limit });
    res.json(result);
  } catch (err) {
    console.error('GET /api/reactivation/queue error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/send', async (req, res) => {
  try {
    const { batch_id } = req.body || {};
    if (!batch_id) {
      return res.status(400).json({ error: 'batch_id is required' });
    }
    const result = await sendBatch(batch_id);
    res.json(result);
  } catch (err) {
    console.error('POST /api/reactivation/queue/send error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/message', async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body || {};
    if (!id || typeof message !== 'string') {
      return res.status(400).json({ error: 'id and message are required' });
    }
    const result = await updateMessage(id, message.trim());
    res.json(result);
  } catch (err) {
    console.error('PATCH /api/reactivation/queue/:id/message error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/apply-template', async (req, res) => {
  try {
    const { batch_id, template_key } = req.body || {};
    if (!batch_id || !template_key) {
      return res.status(400).json({ error: 'batch_id and template_key are required' });
    }
    const result = await applyTemplate(batch_id, template_key);
    res.json(result);
  } catch (err) {
    console.error('POST /api/reactivation/queue/apply-template error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
