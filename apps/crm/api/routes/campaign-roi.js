/**
 * Campaign ROI summary (reads v_campaign_roi_summary).
 * Dashboard: GET /api/dashboard/campaign-roi
 *
 * Example (browser or fetch):
 *   fetch('/api/dashboard/campaign-roi').then(r => r.json()).then(console.log);
 */

const router = require('express').Router();
const { pool } = require('../../lib/db');

router.get('/', async (req, res) => {
  try {
    const sort = String(req.query.sort || 'revenue').toLowerCase();
    const dir = String(req.query.dir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const allowed = [
      'revenue',
      'profit',
      'leads',
      'cost',
      'wins',
      'utm_campaign',
      'campaign_id',
      'conversion_rate',
      'avg_revenue_per_win',
      'revenue_per_lead',
    ];
    const safeCol = allowed.includes(sort) ? sort : 'revenue';

    const r = await pool.query(
      `SELECT campaign_id, utm_campaign, leads, wins, revenue, cost, profit,
              conversion_rate, avg_revenue_per_win, revenue_per_lead
       FROM v_campaign_roi_summary
       ORDER BY ${safeCol} ${dir} NULLS LAST`
    );
    res.json({ ok: true, rows: r.rows });
  } catch (err) {
    console.error('[campaign-roi]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
