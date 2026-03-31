/**
 * Landing page variant review / approve / reject (API only).
 *
 * GET  /api/landing-variants/review
 * POST /api/landing-variants/review
 * POST /api/landing-variants/bulk-review
 */

const router = require('express').Router();
const { pool } = require('../../lib/db');

function isUuid(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim());
}

const ALLOWED_REVIEW = new Set(['approved', 'rejected']);

router.get('/review', async (req, res) => {
  try {
    const conditions = [];
    const params = [];
    let i = 1;

    const rawStatus = req.query.status;
    if (rawStatus == null || String(rawStatus).trim() === '') {
      conditions.push(`status = 'draft'`);
    } else if (String(rawStatus).trim().toLowerCase() === 'all') {
      conditions.push('1=1');
    } else {
      params.push(String(rawStatus).trim());
      conditions.push(`status = $${i++}`);
    }

    if (req.query.page_key) {
      params.push(String(req.query.page_key).trim());
      conditions.push(`page_key = $${i++}`);
    }
    if (req.query.product_focus) {
      params.push(String(req.query.product_focus).trim());
      conditions.push(`product_focus = $${i++}`);
    }
    if (req.query.campaign_id) {
      if (!isUuid(req.query.campaign_id)) {
        return res.status(400).json({ ok: false, error: 'campaign_id must be a valid UUID' });
      }
      params.push(String(req.query.campaign_id).trim());
      conditions.push(`campaign_id = $${i++}::uuid`);
    }

    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '50'), 10) || 50, 1), 200);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const r = await pool.query(
      `SELECT id, headline, subheadline, cta_text, page_key, status, product_focus, campaign_id, created_at
       FROM landing_page_variants
       ${where}
       ORDER BY created_at DESC
       LIMIT ${limit}`,
      params
    );

    res.json({ ok: true, rows: r.rows });
  } catch (err) {
    console.error('[landing-variant-review]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/review', async (req, res) => {
  try {
    const body = req.body || {};
    const id = body.id != null ? String(body.id).trim() : '';
    const status = body.status != null ? String(body.status).trim().toLowerCase() : '';
    const notes = body.notes != null ? String(body.notes) : null;

    if (!isUuid(id)) {
      return res.status(400).json({ ok: false, error: 'id must be a valid UUID' });
    }
    if (!ALLOWED_REVIEW.has(status)) {
      return res.status(400).json({ ok: false, error: 'status must be approved or rejected' });
    }

    const r = await pool.query(
      `UPDATE landing_page_variants SET
         status = $2,
         notes = CASE
           WHEN $3::text IS NOT NULL AND BTRIM($3::text) <> '' THEN
             CASE
               WHEN notes IS NULL OR BTRIM(COALESCE(notes::text, '')) = '' THEN BTRIM($3::text)
               ELSE notes || E'\n' || BTRIM($3::text)
             END
           ELSE notes
         END,
         updated_at = NOW()
       WHERE id = $1::uuid
       RETURNING *`,
      [id, status, notes]
    );

    if (!r.rows[0]) {
      return res.status(404).json({ ok: false, error: 'landing variant not found' });
    }

    res.json({ ok: true, row: r.rows[0] });
  } catch (err) {
    console.error('[landing-variant-review]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/bulk-review', async (req, res) => {
  try {
    const body = req.body || {};
    const ids = Array.isArray(body.ids) ? body.ids : [];
    const status = body.status != null ? String(body.status).trim().toLowerCase() : '';

    if (!ALLOWED_REVIEW.has(status)) {
      return res.status(400).json({ ok: false, error: 'status must be approved or rejected' });
    }
    const uuids = ids.map((x) => String(x || '').trim()).filter(isUuid);
    if (uuids.length === 0) {
      return res.status(400).json({ ok: false, error: 'ids must be a non-empty array of UUIDs' });
    }

    const r = await pool.query(
      `UPDATE landing_page_variants
       SET status = $1, updated_at = NOW()
       WHERE id = ANY($2::uuid[])`,
      [status, uuids]
    );

    res.json({ ok: true, count: r.rowCount });
  } catch (err) {
    console.error('[landing-variant-review]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
