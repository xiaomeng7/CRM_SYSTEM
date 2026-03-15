/**
 * Owner Dashboard API
 * Single endpoint for homepage: cashflow, priority customers, tasks, opportunities, SMS replies.
 * @see docs/owner-dashboard.md
 */

const { pool } = require('../../lib/db');

const startOfWeek = `date_trunc('week', CURRENT_DATE)::timestamptz`;
const SMS_INBOUND = ['inbound_sms', 'inbound_sms_unmatched'];

function formatTaskDue(dueAt) {
  if (!dueAt) return 'upcoming';
  const d = new Date(dueAt);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (t < today) return 'overdue';
  if (t.getTime() === today.getTime()) return 'today';
  return 'upcoming';
}

module.exports = require('express').Router().get('/', async (req, res) => {
  try {
    // 1. Cashflow
    let jobsWonRes;
    try {
      jobsWonRes = await pool.query(
        `SELECT COUNT(*) AS n FROM opportunities
         WHERE stage = 'won' AND COALESCE(won_at, closed_at) >= ${startOfWeek}`
      );
    } catch (_) {
      jobsWonRes = await pool.query(
        `SELECT COUNT(*) AS n FROM opportunities WHERE stage = 'won' AND closed_at >= ${startOfWeek}`
      );
    }
    const [quotesSentRes, invoicesRes, paymentsRes, outstandingRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS n FROM opportunities WHERE stage = 'quote_sent'`),
      pool.query(
        `SELECT COUNT(*) AS n FROM invoices WHERE invoice_date >= date_trunc('week', CURRENT_DATE)::date`
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM invoices WHERE LOWER(TRIM(COALESCE(status, ''))) = 'paid'`
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM invoices WHERE LOWER(TRIM(COALESCE(status, ''))) != 'paid'`
      ),
    ]);

    const cashflow = {
      jobsWonThisWeek: parseInt(jobsWonRes.rows[0]?.n ?? 0, 10),
      quotesSent: parseInt(quotesSentRes.rows[0]?.n ?? 0, 10),
      invoicesIssued: parseInt(invoicesRes.rows[0]?.n ?? 0, 10),
      paymentsReceived: parseFloat(paymentsRes.rows[0]?.total ?? 0),
      outstanding: parseFloat(outstandingRes.rows[0]?.total ?? 0),
    };

    // 2. Priority Customers (top 5)
    let priorityRows = [];
    try {
      const r = await pool.query(
        `SELECT contact_id, name, phone, priority_score
         FROM crm_priority_contacts ORDER BY priority_score DESC LIMIT 5`
      );
      priorityRows = r.rows;
    } catch (_) {}
    const priorityCustomers = priorityRows.map((p) => ({
      contact_id: p.contact_id,
      name: p.name || '—',
      phone: p.phone || '—',
      priority_score: p.priority_score,
    }));

    // 3. Tasks (grouped: overdue, today, upcoming)
    const tasksRes = await pool.query(
      `SELECT t.id, t.contact_id, t.title, t.status, t.due_at, c.name AS contact_name, c.phone
       FROM tasks t
       LEFT JOIN contacts c ON c.id = t.contact_id
       WHERE t.status = ANY($1)
       ORDER BY t.due_at ASC NULLS LAST, t.created_at ASC
       LIMIT 50`,
      [['open', 'pending']]
    );
    const grouped = { overdue: [], today: [], upcoming: [] };
    for (const r of tasksRes.rows) {
      const bucket = formatTaskDue(r.due_at);
      grouped[bucket].push({
        id: r.id,
        contact_id: r.contact_id,
        title: r.title,
        due_at: r.due_at,
        contact_name: r.contact_name,
        phone: r.phone,
      });
    }
    const tasks = grouped;

    // 4. Opportunities by stage + total potential
    const oppStages = ['site_visit_booked', 'inspection_done', 'quote_sent', 'decision_pending', 'won'];
    const stageCounts = {};
    let totalPotential = 0;
    for (const stage of oppStages) {
      const r = await pool.query(
        `SELECT COUNT(*) AS n, COALESCE(SUM(value_estimate), 0) AS val
         FROM opportunities WHERE stage = $1 AND COALESCE(status, 'open') = 'open'`,
        [stage]
      );
      stageCounts[stage] = parseInt(r.rows[0]?.n ?? 0, 10);
      if (stage !== 'won') totalPotential += parseFloat(r.rows[0]?.val ?? 0);
    }
    const opportunities = { stageCounts, totalPotential };

    // 5. SMS Replies (latest inbound)
    let repliesRows = [];
    try {
      const rr = await pool.query(
        `SELECT a.id, a.contact_id, a.summary AS message, a.occurred_at AS received_at,
                COALESCE(c.name, 'Unknown') AS contact_name
         FROM activities a
         LEFT JOIN contacts c ON c.id = a.contact_id
         WHERE a.activity_type = ANY($1)
         ORDER BY a.occurred_at DESC LIMIT 10`,
        [SMS_INBOUND]
      );
      repliesRows = rr.rows;
    } catch (_) {}
    const smsReplies = repliesRows.map((r) => ({
      id: r.id,
      contact_id: r.contact_id,
      contact: r.contact_name,
      message: r.message,
      received_at: r.received_at,
    }));

    res.json({ cashflow, priorityCustomers, tasks, opportunities, smsReplies });
  } catch (e) {
    console.error('GET /api/owner-dashboard error:', e);
    res.status(500).json({ error: e.message });
  }
});
