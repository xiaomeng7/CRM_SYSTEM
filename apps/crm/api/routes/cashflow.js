/**
 * Cashflow Dashboard API
 * All financial data from ServiceM8 (invoices). CRM only displays aggregated data.
 * @see docs/cashflow-dashboard.md
 */

const { pool } = require('../../lib/db');

const startOfWeek = `date_trunc('week', CURRENT_DATE)::timestamptz`;

function buildJobSite(row) {
  const line = row.job_address_line && String(row.job_address_line).trim();
  const suburb = row.job_suburb && String(row.job_suburb).trim();
  if (line && suburb) return `${line}, ${suburb}`;
  if (line) return line;
  if (suburb) return suburb;
  return null;
}

function buildJobLabel(row) {
  const num = row.job_number && String(row.job_number).trim();
  const site = buildJobSite(row);
  const status = row.job_status && String(row.job_status).trim();
  const customer = row.customer && String(row.customer).trim().toLowerCase();
  const desc = row.job_description && String(row.job_description).trim();
  const descOk = desc && desc.toLowerCase() !== customer;

  if (num) {
    let label = num;
    if (site) label += ` · ${site}`;
    else if (descOk) label += ` · ${desc.slice(0, 40)}`;
    if (status) label += ` (${status})`;
    return label;
  }
  if (site) return site + (status ? ` (${status})` : '');
  if (descOk) return desc.length > 50 ? `${desc.slice(0, 50)}…` : desc;
  return null;
}

function resolveJobNumber(row) {
  const num = row.job_number && String(row.job_number).trim();
  if (num) return num;
  if (row.servicem8_job_uuid) {
    return `SM8-${String(row.servicem8_job_uuid).slice(0, 8)}`;
  }
  return null;
}

const router = require('express').Router();

router.get('/outstanding-details', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const totalRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*)::int AS count
       FROM invoices WHERE status = 'outstanding'`
    );
    const rows = await pool.query(
      `SELECT i.id, i.invoice_number, i.amount, i.due_date, i.invoice_date, i.status,
              i.job_id, i.servicem8_invoice_uuid, i.servicem8_job_uuid,
              a.name AS customer,
              COALESCE(j1.job_number, j2.job_number) AS job_number,
              COALESCE(j1.suburb, j2.suburb) AS job_suburb,
              COALESCE(j1.address_line, j2.address_line) AS job_address_line,
              COALESCE(j1.description, j2.description) AS job_description,
              COALESCE(j1.status, j2.status) AS job_status,
              COALESCE(j1.servicem8_job_uuid, j2.servicem8_job_uuid) AS servicem8_job_uuid
       FROM invoices i
       LEFT JOIN accounts a ON a.id = i.account_id
       LEFT JOIN jobs j1 ON j1.id = i.job_id
       LEFT JOIN jobs j2 ON i.job_id IS NULL
         AND i.servicem8_job_uuid IS NOT NULL
         AND j2.servicem8_job_uuid = i.servicem8_job_uuid
       WHERE i.status = 'outstanding'
       ORDER BY i.amount DESC NULLS LAST, i.due_date ASC NULLS LAST
       LIMIT $1`,
      [limit]
    );
    const invoices = rows.rows.map((r) => {
      let days_overdue = null;
      const dueRaw = r.due_date || r.invoice_date;
      if (dueRaw) {
        const due = new Date(dueRaw);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        due.setHours(0, 0, 0, 0);
        if (due < today) {
          days_overdue = Math.floor((today - due) / 86400000);
        }
      }
      const jobNumber = resolveJobNumber(r);
      const jobSite = buildJobSite(r);
      const jobLabel = buildJobLabel(r);
      const invoiceNumber =
        r.invoice_number ||
        (r.servicem8_invoice_uuid ? `SM8-${String(r.servicem8_invoice_uuid).slice(0, 8)}` : null);
      const dueDate = r.due_date
        ? String(r.due_date).slice(0, 10)
        : r.invoice_date
          ? String(r.invoice_date).slice(0, 10)
          : null;
      return {
        id: r.id,
        invoice_number: invoiceNumber,
        customer: r.customer || '—',
        amount: parseFloat(r.amount),
        due_date: dueDate,
        due_date_is_invoice_date: !r.due_date && !!r.invoice_date,
        days_overdue,
        job_id: r.job_id || null,
        job_number: jobNumber,
        job_site: jobSite,
        job_label: jobLabel,
        servicem8_job_uuid: r.servicem8_job_uuid || null,
      };
    });
    res.json({
      ok: true,
      source: 'ServiceM8',
      criteria: "invoices.status = 'outstanding'",
      total: parseFloat(totalRes.rows[0]?.total ?? 0),
      count: Number(totalRes.rows[0]?.count ?? 0),
      invoices,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Request failed' });
  }
});

router.get('/dashboard', async (req, res) => {
    try {
      // Jobs Won This Week - CRM opportunities (closed_at; won_at when migrated)
      let jobsWonRes;
      try {
        jobsWonRes = await pool.query(
          `SELECT COUNT(*) AS n FROM opportunities
           WHERE stage = 'won'
           AND COALESCE(won_at, closed_at) >= ${startOfWeek}`
        );
      } catch (_) {
        jobsWonRes = await pool.query(
          `SELECT COUNT(*) AS n FROM opportunities
           WHERE stage = 'won' AND closed_at >= ${startOfWeek}`
        );
      }
      const jobsWonThisWeek = parseInt(jobsWonRes.rows[0]?.n ?? 0, 10);

      // Quotes Sent - CRM opportunities
      const quotesSentRes = await pool.query(
        `SELECT COUNT(*) AS n FROM opportunities WHERE stage = 'quote_sent'`
      );
      const quotesSent = parseInt(quotesSentRes.rows[0]?.n ?? 0, 10);

      // Invoices Issued This Week - ServiceM8 invoices
      const invoicesIssuedRes = await pool.query(
        `SELECT COUNT(*) AS n FROM invoices
         WHERE invoice_date >= date_trunc('week', CURRENT_DATE)::date`
      );
      const invoicesIssuedThisWeek = parseInt(invoicesIssuedRes.rows[0]?.n ?? 0, 10);

      // Payments Received - ServiceM8 invoices, status = paid
      const paymentsRes = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM invoices
         WHERE LOWER(TRIM(COALESCE(status, ''))) = 'paid'`
      );
      const paymentsReceived = parseFloat(paymentsRes.rows[0]?.total ?? 0);

      // Outstanding Amount - ServiceM8 invoices (exclude paid)
      const outstandingRes = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM invoices
         WHERE LOWER(TRIM(COALESCE(status, ''))) != 'paid'`
      );
      const outstandingAmount = parseFloat(outstandingRes.rows[0]?.total ?? 0);

      // Outstanding Invoices table
      const outstandingRows = await pool.query(
        `SELECT a.name AS customer, i.amount, i.due_date,
                CASE WHEN i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE
                     THEN (CURRENT_DATE - i.due_date)::int ELSE NULL END AS days_overdue
         FROM invoices i
         LEFT JOIN accounts a ON a.id = i.account_id
         WHERE LOWER(TRIM(COALESCE(i.status, ''))) != 'paid'
         ORDER BY i.due_date ASC NULLS LAST
         LIMIT 100`
      );
      const outstandingInvoices = outstandingRows.rows.map((r) => ({
        customer: r.customer || '—',
        amount: r.amount,
        due_date: r.due_date,
        days_overdue: r.days_overdue,
      }));

      // Quotes Waiting Decision - opportunities quote_sent or decision_pending
      let quotesRows;
      try {
        quotesRows = await pool.query(
          `SELECT a.name AS customer, o.value_estimate AS quote_value,
                  COALESCE(o.quote_sent_at, o.updated_at) AS quote_sent_at
           FROM opportunities o
           LEFT JOIN accounts a ON a.id = o.account_id
           WHERE o.stage IN ('quote_sent', 'decision_pending')
           ORDER BY COALESCE(o.quote_sent_at, o.updated_at) DESC NULLS LAST
           LIMIT 100`
        );
      } catch (_) {
        quotesRows = await pool.query(
          `SELECT a.name AS customer, o.value_estimate AS quote_value,
                  o.updated_at AS quote_sent_at
           FROM opportunities o
           LEFT JOIN accounts a ON a.id = o.account_id
           WHERE o.stage IN ('quote_sent', 'decision_pending')
           ORDER BY o.updated_at DESC NULLS LAST
           LIMIT 100`
        );
      }
      const quotesWaitingDecision = quotesRows.rows.map((r) => {
        const sentAt = r.quote_sent_at ? new Date(r.quote_sent_at) : null;
        const daysSince = sentAt
          ? Math.floor((Date.now() - sentAt.getTime()) / (24 * 60 * 60 * 1000))
          : null;
        return {
          customer: r.customer || '—',
          quote_value: r.quote_value,
          quote_sent_at: r.quote_sent_at,
          days_since_quote: daysSince,
        };
      });

      res.json({
        jobsWonThisWeek,
        quotesSent,
        invoicesIssuedThisWeek,
        paymentsReceived,
        outstandingAmount,
        outstandingInvoices,
        quotesWaitingDecision,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

module.exports = router;
