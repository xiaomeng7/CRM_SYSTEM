/**
 * Reactivation SMS Queue API
 * POST /api/reactivation/queue/generate - generate preview queue
 * GET /api/reactivation/queue - list queue items
 * POST /api/reactivation/queue/send - send batch
 */

const router = require('express').Router();
const { generateQueue, listQueue, sendBatch } = require('../../services/reactivation-sms-engine');

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

module.exports = router;
