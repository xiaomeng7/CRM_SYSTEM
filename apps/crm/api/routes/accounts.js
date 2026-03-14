/**
 * Accounts API - read-only
 */

const router = require('express').Router();
const { pool } = require('../../lib/db');

router.get('/:id', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, address_line, suburb, postcode, status, created_at FROM accounts WHERE id = $1::uuid`,
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/detail', async (req, res) => {
  try {
    const acc = await pool.query(
      `SELECT id, name, address_line, suburb, postcode, status, created_at FROM accounts WHERE id = $1::uuid`,
      [req.params.id]
    );
    if (!acc.rows[0]) return res.status(404).json({ error: 'Not found' });
    const account = acc.rows[0];
    const [contactsRes, jobsRes] = await Promise.all([
      pool.query(
        `SELECT id, name, phone, email FROM contacts WHERE account_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [req.params.id]
      ),
      pool.query(
        `SELECT id, job_number, description, suburb, status, job_date, completed_at FROM jobs WHERE account_id = $1 ORDER BY job_date DESC NULLS LAST LIMIT 20`,
        [req.params.id]
      ),
    ]);
    let summary = null;
    try {
      const s = await pool.query(
        `SELECT jobs_count, total_revenue, last_job_date, months_since_last_job, priority_score
         FROM crm_account_summary WHERE account_id = $1`,
        [req.params.id]
      );
      summary = s.rows[0] || {};
    } catch (_) {
      summary = {};
    }
    res.json({
      account,
      contacts: contactsRes.rows,
      jobs: jobsRes.rows,
      summary: summary,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
