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
    const listOpts = {
      status: req.query.status,
      limit: parseInt(req.query.limit, 10) || 100,
      offset: parseInt(req.query.offset, 10) || 0,
    };
    if (Object.prototype.hasOwnProperty.call(req.query, 'creative_version')) {
      listOpts.creative_version = req.query.creative_version;
    }
    if (Object.prototype.hasOwnProperty.call(req.query, 'landing_page_version')) {
      listOpts.landing_page_version = req.query.landing_page_version;
    }
    if (Object.prototype.hasOwnProperty.call(req.query, 'utm_campaign')) {
      listOpts.utm_campaign = req.query.utm_campaign;
    }
    if (req.query.date_from) listOpts.date_from = req.query.date_from;
    if (req.query.date_to) listOpts.date_to = req.query.date_to;
    const rows = await leads.list(listOpts);
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
      `SELECT
         l.*,
         c.name AS contact_name,
         c.phone AS contact_phone,
         a.suburb AS account_suburb,
         a.address_line AS account_address_line,
         ox.service_m8_job_id AS opportunity_service_m8_job_id,
         ox.id AS opportunity_id,
         (sc.j->>'score')::numeric AS latest_score,
         COALESCE(sc.j->>'tier', sc.j->>'score_grade') AS latest_tier,
         (sc.j->>'expected_value')::numeric AS latest_expected_value,
         COALESCE(sc.j->>'recommended_action', '') AS latest_recommended_action,
         COALESCE(sc.j->>'reasoning', sc.j->>'rationale', '') AS latest_reasoning,
         COALESCE(sc.j->>'scored_at', sc.j->>'created_at') AS latest_scored_at
       FROM leads l
       LEFT JOIN contacts c ON l.contact_id = c.id
       LEFT JOIN accounts a ON l.account_id = a.id
       LEFT JOIN LATERAL (
         SELECT o.id, o.service_m8_job_id
         FROM opportunities o
         WHERE o.lead_id = l.id
         ORDER BY o.created_at DESC NULLS LAST
         LIMIT 1
       ) ox ON TRUE
       LEFT JOIN LATERAL (
         SELECT to_jsonb(ls) AS j
         FROM lead_scores ls
         WHERE ls.lead_id = l.id
         ORDER BY COALESCE(ls.scored_at, ls.created_at) DESC, ls.created_at DESC, ls.id DESC
         LIMIT 1
       ) sc ON TRUE
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

// DELETE /api/leads/:id — hard delete (removes lead + linked activities)
router.delete('/:id', async (req, res) => {
  const { pool } = require('../../lib/db');
  try {
    const check = await pool.query(
      `SELECT l.id, COALESCE(c.name, l.id::text) AS name
       FROM leads l LEFT JOIN contacts c ON l.contact_id = c.id
       WHERE l.id = $1`,
      [req.params.id]
    );
    if (!check.rows[0]) return res.status(404).json({ error: 'Lead not found' });
    await pool.query(`DELETE FROM activities WHERE lead_id = $1`, [req.params.id]);
    await pool.query(`DELETE FROM tasks WHERE lead_id = $1`, [req.params.id]);
    await pool.query(`UPDATE opportunities SET lead_id = NULL WHERE lead_id = $1`, [req.params.id]);
    await pool.query(`DELETE FROM leads WHERE id = $1`, [req.params.id]);
    res.json({ ok: true, deleted: check.rows[0].name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
