/**
 * Contacts API routes
 */

const router = require('express').Router();
const contacts = require('../../services/contacts');
const { sendSMS } = require('@bht/integrations');
const { pool } = require('../../lib/db');

router.get('/', async (req, res) => {
  try {
    const rows = await contacts.list({
      q: req.query.q,
      limit: parseInt(req.query.limit, 10) || 100,
      offset: parseInt(req.query.offset, 10) || 0,
    });
    res.json(rows);
  } catch (err) {
    console.error('GET /api/contacts error:', err.message);
    const msg = /does not exist|relation .* does not exist/i.test(err.message)
      ? 'Contacts table not set up. Run domain model migration: pnpm run db:domain-migration (or node scripts/run-domain-migration.js)'
      : err.message;
    res.status(500).json({ error: msg });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await contacts.getById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/reactivate', async (req, res) => {
  try {
    const contact = await contacts.getById(req.params.id);
    if (!contact) return res.status(404).json({ ok: false, error: 'Not found' });
    if (!contact.phone) return res.status(400).json({ ok: false, error: 'Contact has no phone number' });

    const name = (contact.name || '').trim() || 'there';
    const message =
      'Hi ' + name + ',\n\n' +
      "Just checking in — we're reviewing some previous electrical work in the area.\n\n" +
      'If you ever need help with lighting, power points, EV chargers or anything electrical, feel free to message me.\n\n' +
      '– Meng\nBetter Home Technology';

    await sendSMS(contact.phone, message);

    await pool.query(
      `INSERT INTO activities (contact_id, lead_id, opportunity_id, activity_type, summary, created_by)
       VALUES ($1, NULL, NULL, 'sms', 'reactivation message sent', 'crm')`,
      [contact.id]
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('reactivate error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
