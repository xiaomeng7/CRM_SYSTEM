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
      // Revenue received: paid invoices in last 3 months
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM invoices
         WHERE status = 'paid'
         AND COALESCE(paid_at, invoice_date, updated_at) >= NOW() - INTERVAL '3 months'`
      ),
      // Outstanding: only real in-progress work orders (not quotes/pipeline/void)
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM invoices
         WHERE status = 'outstanding'`
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

    // 4. Opportunities by stage — last 3 months, real stages
    const oppStages = ['site_visit_booked', 'quote_sent', 'won', 'lost'];
    const stageCounts = {};
    // Pipeline value = sum of invoice amounts for quotes in last 3 months
    const pipelineRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM invoices
       WHERE status = 'pipeline'
       AND COALESCE(invoice_date, updated_at) >= NOW() - INTERVAL '3 months'`
    );
    const totalPotential = parseFloat(pipelineRes.rows[0]?.total ?? 0);
    for (const stage of oppStages) {
      const r = await pool.query(
        `SELECT COUNT(*) AS n FROM opportunities
         WHERE stage = $1
         AND COALESCE(won_at, lost_at, inspection_date, created_at) >= NOW() - INTERVAL '3 months'`,
        [stage]
      );
      stageCounts[stage] = parseInt(r.rows[0]?.n ?? 0, 10);
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

    // 6. Customer Scoring 2.0: Top 20 Hot Leads, High Value Dormant
    let top20HotLeads = [];
    let highValueDormantCustomers = [];
    try {
      const hotRes = await pool.query(
        `SELECT s.contact_id, c.name, c.phone, c.email, a.name AS account_name,
                s.total_score, s.value_score, s.conversion_score, s.urgency_score, s.relationship_score
         FROM customer_scores s
         JOIN contacts c ON c.id = s.contact_id
         LEFT JOIN accounts a ON a.id = c.account_id
         WHERE s.segment = 'Hot'
         ORDER BY s.total_score DESC, s.calculated_at DESC
         LIMIT 20`
      );
      top20HotLeads = hotRes.rows.map((r) => ({
        contact_id: r.contact_id,
        name: r.name,
        phone: r.phone,
        email: r.email,
        account_name: r.account_name,
        total_score: Number(r.total_score),
        value_score: Number(r.value_score),
        conversion_score: Number(r.conversion_score),
        urgency_score: Number(r.urgency_score),
        relationship_score: Number(r.relationship_score),
      }));
      const dormantRes = await pool.query(
        `SELECT s.contact_id, c.name, c.phone, c.email, a.name AS account_name,
                s.total_score, s.value_score, s.last_contact_days
         FROM customer_scores s
         JOIN contacts c ON c.id = s.contact_id
         LEFT JOIN accounts a ON a.id = c.account_id
         WHERE s.segment = 'HighValueDormant'
         ORDER BY s.value_score DESC
         LIMIT 50`
      );
      highValueDormantCustomers = dormantRes.rows.map((r) => ({
        contact_id: r.contact_id,
        name: r.name,
        phone: r.phone,
        email: r.email,
        account_name: r.account_name,
        total_score: Number(r.total_score),
        value_score: Number(r.value_score),
        last_contact_days: r.last_contact_days,
      }));
    } catch (_) {}

    res.json({
      cashflow,
      priorityCustomers,
      tasks,
      opportunities,
      smsReplies,
      top20HotLeads,
      highValueDormantCustomers,
    });
  } catch (e) {
    console.error('GET /api/owner-dashboard error:', e);
    res.status(500).json({ error: e.message });
  }
});
