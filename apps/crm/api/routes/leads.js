/**
 * Leads API routes
 */

const router = require('express').Router();
const leads = require('../../services/leads');
const { pool } = require('../../lib/db');

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.contact_id) return res.status(400).json({ error: 'contact_id is required' });
    const row = await leads.create({
      contact_id: body.contact_id,
      account_id: body.account_id,
      source: body.source || 'reply_inbox',
      created_by: body.created_by || 'reply-inbox',
    });
    if (row.contact_id && (body.source === 'reply_inbox' || body.source === 'reply-inbox')) {
      await pool.query(
        `INSERT INTO activities (contact_id, lead_id, activity_type, summary, created_by)
         VALUES ($1, $2, 'lead_created', 'Lead created from reply inbox', 'reply-inbox')`,
        [row.contact_id, row.id]
      );
    }
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
    const enriched = await pool.query(
      `SELECT l.*, c.name AS contact_name, c.phone AS contact_phone, a.suburb AS account_suburb
       FROM leads l
       LEFT JOIN contacts c ON l.contact_id = c.id
       LEFT JOIN accounts a ON l.account_id = a.id
       WHERE l.id = $1`,
      [row.id]
    ).then((r) => r.rows[0]).catch(() => row);
    const out = enriched || row;
    res.json({
      ...out,
      name: out.contact_name || out.name || '—',
      phone: out.contact_phone || out.phone || '—',
      suburb: out.account_suburb || out.suburb || '—',
    });
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
