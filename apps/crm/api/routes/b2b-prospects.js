/**
 * B2B Prospects API
 * GET    /api/b2b-prospects          list + filter
 * POST   /api/b2b-prospects          create one
 * PATCH  /api/b2b-prospects/:id      update status / notes
 * POST   /api/b2b-prospects/import   bulk CSV import
 * POST   /api/b2b-prospects/:id/sms  send outreach SMS
 */

const router = require('express').Router();
const { pool } = require('../../lib/db');
const { sendSMS } = require('@bht/integrations');

// GET list
router.get('/', async (req, res) => {
  try {
    const { status, type, suburb, q, limit = 100, offset = 0 } = req.query;
    const conditions = [];
    const params = [];

    if (status) { params.push(status); conditions.push(`outreach_status = $${params.length}`); }
    if (type)   { params.push(type);   conditions.push(`prospect_type = $${params.length}`); }
    if (suburb) { params.push(`%${suburb}%`); conditions.push(`suburb ILIKE $${params.length}`); }
    if (q) {
      params.push(`%${q}%`);
      const n = params.length;
      conditions.push(`(company_name ILIKE $${n} OR contact_name ILIKE $${n} OR email ILIKE $${n} OR phone ILIKE $${n})`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    params.push(Number(limit), Number(offset));

    const [rows, countRow] = await Promise.all([
      pool.query(
        `SELECT * FROM b2b_prospects ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      ),
      pool.query(`SELECT COUNT(*) FROM b2b_prospects ${where}`, params.slice(0, -2)),
    ]);

    const stats = await pool.query(`
      SELECT outreach_status, COUNT(*) AS cnt
      FROM b2b_prospects
      GROUP BY outreach_status
    `);

    res.json({
      ok: true,
      prospects: rows.rows,
      total: parseInt(countRow.rows[0].count),
      stats: stats.rows,
    });
  } catch (e) {
    console.error('[b2b-prospects GET]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST create
router.post('/', async (req, res) => {
  try {
    const {
      company_name, contact_name, phone, email, address, suburb,
      website, portfolio_size, prospect_type = 'rental_agency',
      notes, source = 'manual',
    } = req.body || {};

    if (!company_name || !company_name.trim()) {
      return res.status(400).json({ ok: false, error: 'company_name required' });
    }

    const r = await pool.query(
      `INSERT INTO b2b_prospects
        (company_name, contact_name, phone, email, address, suburb, website,
         portfolio_size, prospect_type, notes, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        company_name.trim(),
        contact_name?.trim() || null,
        phone?.trim() || null,
        email?.trim() || null,
        address?.trim() || null,
        suburb?.trim() || null,
        website?.trim() || null,
        portfolio_size || null,
        prospect_type,
        notes?.trim() || null,
        source,
      ]
    );
    res.status(201).json({ ok: true, prospect: r.rows[0] });
  } catch (e) {
    console.error('[b2b-prospects POST]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// PATCH update
router.patch('/:id', async (req, res) => {
  try {
    const allowed = [
      'outreach_status', 'contact_name', 'phone', 'email', 'notes',
      'next_followup_at', 'last_contacted_at', 'portfolio_size', 'suburb',
    ];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    if (!Object.keys(updates).length) {
      return res.status(400).json({ ok: false, error: 'No valid fields to update' });
    }

    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`);
    const values = [req.params.id, ...Object.values(updates)];

    const r = await pool.query(
      `UPDATE b2b_prospects SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      values
    );
    if (!r.rows[0]) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, prospect: r.rows[0] });
  } catch (e) {
    console.error('[b2b-prospects PATCH]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST bulk import (JSON array)
router.post('/import', async (req, res) => {
  try {
    const rows = Array.isArray(req.body) ? req.body : (req.body?.rows || []);
    if (!rows.length) return res.status(400).json({ ok: false, error: 'No rows provided' });

    let inserted = 0, skipped = 0;
    for (const row of rows) {
      if (!row.company_name?.trim()) { skipped++; continue; }
      try {
        await pool.query(
          `INSERT INTO b2b_prospects
            (company_name, contact_name, phone, email, suburb, portfolio_size, prospect_type, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT DO NOTHING`,
          [
            row.company_name.trim(),
            row.contact_name?.trim() || null,
            row.phone?.trim() || null,
            row.email?.trim() || null,
            row.suburb?.trim() || null,
            row.portfolio_size || null,
            row.prospect_type || 'rental_agency',
            row.source || 'csv_import',
          ]
        );
        inserted++;
      } catch { skipped++; }
    }
    res.json({ ok: true, inserted, skipped });
  } catch (e) {
    console.error('[b2b-prospects import]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST send SMS to one prospect
router.post('/:id/sms', async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ ok: false, error: 'message required' });

    const r = await pool.query('SELECT * FROM b2b_prospects WHERE id = $1', [req.params.id]);
    const prospect = r.rows[0];
    if (!prospect) return res.status(404).json({ ok: false, error: 'Not found' });
    if (!prospect.phone) return res.status(400).json({ ok: false, error: 'No phone number' });

    await sendSMS(prospect.phone, message);

    await pool.query(
      `INSERT INTO b2b_outreach_log (prospect_id, channel, message_body) VALUES ($1, 'sms', $2)`,
      [prospect.id, message]
    );
    await pool.query(
      `UPDATE b2b_prospects SET last_contacted_at = NOW(),
        outreach_status = CASE WHEN outreach_status = 'not_contacted' THEN 'email_sent' ELSE outreach_status END
       WHERE id = $1`,
      [prospect.id]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error('[b2b-prospects SMS]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST bulk SMS
router.post('/bulk-sms', async (req, res) => {
  try {
    const { ids, message } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ ok: false, error: 'ids required' });
    if (!message?.trim()) return res.status(400).json({ ok: false, error: 'message required' });

    const rows = await pool.query(
      `SELECT id, phone FROM b2b_prospects WHERE id = ANY($1) AND phone IS NOT NULL`,
      [ids]
    );

    let sent = 0, failed = 0;
    for (const p of rows.rows) {
      try {
        await sendSMS(p.phone, message.trim());
        await pool.query(
          `INSERT INTO b2b_outreach_log (prospect_id, channel, message_body) VALUES ($1, 'sms', $2)`,
          [p.id, message.trim()]
        );
        await pool.query(
          `UPDATE b2b_prospects SET last_contacted_at = NOW() WHERE id = $1`, [p.id]
        );
        sent++;
      } catch { failed++; }
    }
    res.json({ ok: true, sent, failed });
  } catch (e) {
    console.error('[b2b-prospects bulk-sms]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
