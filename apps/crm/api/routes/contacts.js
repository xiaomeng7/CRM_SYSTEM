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

router.get('/:id/activities', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 20);
    const result = await pool.query(
      `SELECT id, activity_type, summary, occurred_at, created_by
       FROM activities
       WHERE contact_id = $1::uuid
       ORDER BY occurred_at DESC
       LIMIT $2`,
      [req.params.id, limit]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/detail', async (req, res) => {
  try {
    const contact = await contacts.getById(req.params.id);
    if (!contact) return res.status(404).json({ error: 'Not found' });
    const [activitiesRes, tasksRes, leadsRes] = await Promise.all([
      pool.query(
        `SELECT id, activity_type, summary, occurred_at, created_by FROM activities WHERE contact_id = $1 ORDER BY occurred_at DESC LIMIT 10`,
        [req.params.id]
      ),
      pool.query(
        `SELECT id, title, status, due_at FROM tasks WHERE contact_id = $1 AND COALESCE(status,'open') IN ('open','pending') ORDER BY due_at ASC NULLS LAST LIMIT 10`,
        [req.params.id]
      ),
      pool.query(
        `SELECT id, status, source, created_at FROM leads WHERE contact_id = $1 ORDER BY created_at DESC LIMIT 10`,
        [req.params.id]
      ),
    ]);
    res.json({
      contact,
      activities: activitiesRes.rows,
      tasks: tasksRes.rows,
      leads: leadsRes.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

/** PATCH /api/contacts/:id — 手动补全客户信息（name, phone, email），仅更新传入的字段 */
router.patch('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    const payload = {};
    if (body.name !== undefined) payload.name = body.name;
    if (body.phone !== undefined) payload.phone = body.phone;
    if (body.email !== undefined) payload.email = body.email;
    const row = await contacts.update(id, payload);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/do-not-contact', async (req, res) => {
  try {
    const contact = await contacts.getById(req.params.id);
    if (!contact) return res.status(404).json({ error: 'Not found' });
    const value = !!req.body?.value;
    const reason = (req.body?.reason || '').trim() || null;
    await pool.query(
      `UPDATE contacts SET do_not_contact = $1, do_not_contact_at = $2, do_not_contact_reason = $3, updated_at = NOW() WHERE id = $4`,
      [value, value ? new Date() : null, reason, req.params.id]
    );
    if (value) {
      await pool.query(
        `INSERT INTO activities (contact_id, lead_id, opportunity_id, activity_type, summary, created_by)
         VALUES ($1, NULL, NULL, 'do_not_contact', $2, 'crm-ui')`,
        [req.params.id, reason || 'Marked do not contact']
      );
    }
    res.json({ ok: true });
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
      'Hi ' + name + ", this is Meng from Better Home Technology.\n\n" +
      "We worked together before and I'm checking in to see how everything is going.\n\n" +
      'If you ever need help with lighting, power points, EV chargers or anything electrical, you can reply to this message and I will get back to you.\n\n' +
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
