/**
 * Tasks API
 * POST /api/tasks - create a task
 */

const router = require('express').Router();
const { pool } = require('../../lib/db');

router.post('/', async (req, res) => {
  try {
    const { contact_id, account_id, title, source } = req.body;
    if (!contact_id) {
      return res.status(400).json({ error: 'contact_id is required' });
    }

    const t = title || 'Follow up SMS reply';
    const createdBy = source || 'reply_inbox';

    const result = await pool.query(
      `INSERT INTO tasks (contact_id, lead_id, opportunity_id, title, status, due_at, created_by)
       VALUES ($1, NULL, NULL, $2, 'open', NOW(), $3)
       RETURNING id, contact_id, title, status, due_at, created_by`,
      [contact_id, t, createdBy]
    );

    const row = result.rows[0];
    res.status(201).json({
      ok: true,
      task: {
        id: row.id,
        contact_id: row.contact_id,
        title: row.title,
        status: row.status,
        due_at: row.due_at,
      },
    });
  } catch (err) {
    console.error('POST /api/tasks error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
