/**
 * Priority Score API
 * GET /api/priority/contacts - top priority contacts from crm_priority_contacts
 */

const router = require('express').Router();
const { pool } = require('../../lib/db');

router.get('/contacts', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const r = await pool.query(
      `SELECT contact_id, account_id, name, phone, suburb, last_job_date, priority_score
       FROM crm_priority_contacts
       ORDER BY priority_score DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ contacts: r.rows });
  } catch (err) {
    if (/relation "crm_priority_contacts" does not exist/i.test(err.message)) {
      return res.json({ contacts: [] });
    }
    console.error('GET /api/priority/contacts error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
