/**
 * Leads API routes
 */

const router = require('express').Router();
const leads = require('../../services/leads');

router.post('/', async (req, res) => {
  try {
    const row = await leads.create(req.body);
    res.status(201).json(row);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const rows = await leads.list({
      status: req.query.status,
      limit: parseInt(req.query.limit, 10) || 100,
      offset: parseInt(req.query.offset, 10) || 0,
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await leads.getById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status is required' });
    const row = await leads.updateStatus(req.params.id, status, req.body.created_by);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    if (err.message.includes('Invalid status') || err.message.includes('Cannot update')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/convert', async (req, res) => {
  try {
    const result = await leads.convertToOpportunity(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.status(201).json(result);
  } catch (err) {
    if (err.message.includes('already converted') || err.message.includes('Invalid')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
