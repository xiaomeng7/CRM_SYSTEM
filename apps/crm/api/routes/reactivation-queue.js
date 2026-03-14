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
