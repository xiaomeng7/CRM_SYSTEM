/**
 * Data Maintenance API - read-only reports and actions
 */

const path = require('path');
const fs = require('fs');
const router = require('express').Router();
const { pool } = require('../../lib/db');

const REPORTS = {
  'duplicate-phones': async () => {
    const r = await pool.query(
      `SELECT phone, COUNT(*) AS cnt FROM contacts WHERE phone IS NOT NULL AND TRIM(phone) <> ''
       GROUP BY phone HAVING COUNT(*) > 1 ORDER BY cnt DESC LIMIT 100`
    );
    return { title: 'Duplicate Phones', rows: r.rows };
  },
  'duplicate-emails': async () => {
    const r = await pool.query(
      `SELECT LOWER(TRIM(email)) AS email, COUNT(*) AS cnt FROM contacts WHERE email IS NOT NULL AND TRIM(email) <> ''
       GROUP BY LOWER(TRIM(email)) HAVING COUNT(*) > 1 ORDER BY cnt DESC LIMIT 100`
    );
    return { title: 'Duplicate Emails', rows: r.rows };
  },
  'missing-suburb': async () => {
    const r = await pool.query(
      `SELECT id, name, address_line, suburb FROM accounts
       WHERE (suburb IS NULL OR TRIM(suburb) = '') AND address_line IS NOT NULL LIMIT 100`
    );
    return { title: 'Missing Suburb', rows: r.rows };
  },
  'contacts-without-phone': async () => {
    const r = await pool.query(
      `SELECT c.id, c.name, c.email, a.name AS account_name FROM contacts c
       LEFT JOIN accounts a ON a.id = c.account_id
       WHERE c.phone IS NULL OR TRIM(COALESCE(c.phone,'')) = ''
       ORDER BY c.created_at DESC LIMIT 100`
    );
    return { title: 'Contacts Without Phone', rows: r.rows };
  },
  'suspicious-contacts': async () => {
    const r = await pool.query(
      `SELECT c.id, c.name, c.phone, c.email, a.name AS account_name
       FROM contacts c LEFT JOIN accounts a ON a.id = c.account_id
       WHERE (c.phone IS NULL OR TRIM(c.phone) = '') AND (c.email IS NULL OR TRIM(c.email) = '')
         AND c.name ILIKE ANY(ARRAY['%Job%','%Card%','%PAYPAL%','%Transfer%','%Help%'])
       ORDER BY c.created_at DESC LIMIT 100`
    );
    return { title: 'Suspicious Contacts', rows: r.rows };
  },
  'do-not-contact': async () => {
    try {
      const r = await pool.query(
        `SELECT c.id, c.name, c.phone, c.do_not_contact_reason, c.do_not_contact_at
         FROM contacts c WHERE COALESCE(c.do_not_contact, false) = true ORDER BY c.do_not_contact_at DESC NULLS LAST LIMIT 100`
      );
      return { title: 'Do Not Contact', rows: r.rows };
    } catch (_) {
      return { title: 'Do Not Contact', rows: [], note: 'do_not_contact columns may not exist (run migration 011)' };
    }
  },
};

router.get('/report', async (req, res) => {
  try {
    const type = req.query.type || 'missing-suburb';
    const fn = REPORTS[type];
    if (!fn) return res.status(400).json({ error: 'Invalid report type', valid: Object.keys(REPORTS) });
    const result = await fn();
    res.json({ ...result, executed_at: new Date().toISOString() });
  } catch (err) {
    console.error('GET /api/data-maintenance/report error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/execute', async (req, res) => {
  try {
    const { action, confirm } = req.body || {};
    if (confirm !== 'CONFIRM') return res.status(400).json({ error: 'Must send confirm: "CONFIRM"' });
    const actions = {
      'normalize-phone': async () => {
        await pool.query(
          `UPDATE contacts SET phone = regexp_replace(phone, '[^0-9]', '', 'g') WHERE phone IS NOT NULL AND phone <> ''`
        );
        const r = await pool.query(`SELECT COUNT(*) AS cnt FROM contacts WHERE phone IS NOT NULL AND TRIM(phone) <> ''`);
        return { affected: Number(r.rows[0]?.cnt ?? 0) };
      },
      'normalize-email': async () => {
        await pool.query(
          `UPDATE contacts SET email = LOWER(TRIM(email)) WHERE email IS NOT NULL AND email <> ''`
        );
        const r = await pool.query(`SELECT COUNT(*) AS cnt FROM contacts WHERE email IS NOT NULL`);
        return { affected: Number(r.rows[0]?.cnt ?? 0) };
      },
      'fill-missing-suburb': async () => {
        const r = await pool.query(
          `WITH j AS (
             SELECT DISTINCT ON (account_id) account_id, suburb FROM jobs WHERE suburb IS NOT NULL AND TRIM(suburb) <> ''
             ORDER BY account_id, completed_at DESC NULLS LAST, job_date DESC NULLS LAST
           )
           UPDATE accounts a SET suburb = j.suburb
           FROM j WHERE a.id = j.account_id AND (a.suburb IS NULL OR TRIM(a.suburb) = '')`
        );
        return { affected: r.rowCount ?? 0 };
      },
      'rebuild-segmentation': async () => {
        const dir = path.join(__dirname, '../../database');
        for (const f of ['005_customer_segmentation_views.sql', '006_customer_segmentation_account_and_v2.sql', '007_account_reactivation_contacts.sql', '012_reactivation_contacts_exclude_dnc.sql']) {
          const sqlPath = path.join(dir, f);
          if (!fs.existsSync(sqlPath)) continue;
          const sql = fs.readFileSync(sqlPath, 'utf8');
          await pool.query(sql);
        }
        return { affected: 0, summary: 'Segmentation views rebuilt' };
      },
    };
    const fn = actions[action];
    if (!fn) return res.status(400).json({ error: 'Invalid action', valid: Object.keys(actions) });
    const result = await fn();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('POST /api/data-maintenance/execute error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
