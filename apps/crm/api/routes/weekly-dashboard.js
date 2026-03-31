const router = require('express').Router();
const { pool } = require('../../lib/db');
const { summarizeWeeklyMetrics } = require('../../services/leadScoring');

router.get('/', async (req, res) => {
  try {
    const includeAi = String(req.query.ai || '').toLowerCase() === 'true';
    const startDate = req.query.start_date ? new Date(req.query.start_date) : new Date();
    if (isNaN(startDate.getTime())) return res.status(400).json({ error: 'Invalid start_date' });

    const start = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
    const day = start.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    start.setUTCDate(start.getUTCDate() + mondayOffset);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 7);

    const [leads, opps, invoices] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'converted' OR converted_opportunity_id IS NOT NULL) AS converted
         FROM leads
         WHERE created_at >= $1 AND created_at < $2`,
        [start.toISOString(), end.toISOString()]
      ),
      pool.query(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE stage = 'won') AS won,
           COUNT(*) FILTER (WHERE stage = 'lost') AS lost,
           COALESCE(SUM(COALESCE(estimated_value, value_estimate, 0)), 0) AS estimated_total
         FROM opportunities
         WHERE created_at >= $1 AND created_at < $2`,
        [start.toISOString(), end.toISOString()]
      ),
      pool.query(
        `SELECT
           COUNT(*) AS issued,
           COALESCE(SUM(COALESCE(amount, 0)), 0) AS invoiced_amount,
           COALESCE(SUM(COALESCE(amount_paid, 0)), 0) AS paid_amount,
           COALESCE(SUM(COALESCE(amount_due, GREATEST(COALESCE(amount,0)-COALESCE(amount_paid,0),0))), 0) AS due_amount
         FROM invoices
         WHERE invoice_date >= $1::date AND invoice_date < $2::date`,
        [start.toISOString(), end.toISOString()]
      ),
    ]);

    const metrics = {
      week_start: start.toISOString().slice(0, 10),
      week_end: end.toISOString().slice(0, 10),
      leads: {
        total: Number(leads.rows[0]?.total || 0),
        converted: Number(leads.rows[0]?.converted || 0),
      },
      opportunities: {
        total: Number(opps.rows[0]?.total || 0),
        won: Number(opps.rows[0]?.won || 0),
        lost: Number(opps.rows[0]?.lost || 0),
        estimated_total: Number(opps.rows[0]?.estimated_total || 0),
      },
      invoices: {
        issued: Number(invoices.rows[0]?.issued || 0),
        invoiced_amount: Number(invoices.rows[0]?.invoiced_amount || 0),
        paid_amount: Number(invoices.rows[0]?.paid_amount || 0),
        due_amount: Number(invoices.rows[0]?.due_amount || 0),
      },
    };

    let ai_summary = null;
    if (includeAi) {
      ai_summary = await summarizeWeeklyMetrics(metrics);
    }

    res.json({ ...metrics, ai_summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
