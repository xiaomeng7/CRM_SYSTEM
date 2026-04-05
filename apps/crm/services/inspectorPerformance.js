/**
 * Monthly stats for one inspector: leads / won opps / paid invoices / revenue.
 * Filter: leads.source = 'inspector' AND leads.sub_source = source_code.
 * Month boundary: Australia/Adelaide calendar month (same spirit as funnel dashboards).
 */

const { pool } = require('../lib/db');

/** Reuse for inspector payouts (same paid / revenue semantics). */
const PAID_INVOICE_SQL = `(
  i.paid_at IS NOT NULL
  OR LOWER(TRIM(COALESCE(i.status,''))) IN ('paid','complete','completed','closed')
)`;

/**
 * @param {string} sourceCode
 * @param {{ db?: import('pg').Pool }} [opts]
 */
async function getInspectorPerformance(sourceCode, opts = {}) {
  const db = opts.db || pool;
  const code = String(sourceCode || '').trim().toLowerCase();
  if (!code) {
    return { leads: 0, opportunities_won: 0, invoices_paid: 0, total_revenue: 0 };
  }

  const q = `
    WITH bounds AS (
      SELECT
        (DATE_TRUNC('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Australia/Adelaide')) AT TIME ZONE 'Australia/Adelaide') AS t0,
        ((DATE_TRUNC('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Australia/Adelaide')) + INTERVAL '1 month') AT TIME ZONE 'Australia/Adelaide') AS t1
    )
    SELECT
      (SELECT COUNT(*)::bigint
       FROM leads l, bounds b
       WHERE l.source = 'inspector'
         AND LOWER(TRIM(COALESCE(l.sub_source,''))) = $1
         AND l.created_at >= b.t0 AND l.created_at < b.t1) AS leads,
      (SELECT COUNT(*)::bigint
       FROM opportunities o
       INNER JOIN leads l ON l.id = o.lead_id
       , bounds b
       WHERE l.source = 'inspector'
         AND LOWER(TRIM(COALESCE(l.sub_source,''))) = $1
         AND o.stage = 'won'
         AND COALESCE(o.won_at, o.updated_at) >= b.t0
         AND COALESCE(o.won_at, o.updated_at) < b.t1) AS opportunities_won,
      (SELECT COUNT(*)::bigint
       FROM invoices i
       INNER JOIN opportunities o ON o.id = i.opportunity_id
       INNER JOIN leads l ON l.id = o.lead_id
       , bounds b
       WHERE l.source = 'inspector'
         AND LOWER(TRIM(COALESCE(l.sub_source,''))) = $1
         AND ${PAID_INVOICE_SQL}
         AND COALESCE(i.paid_at, i.updated_at) >= b.t0
         AND COALESCE(i.paid_at, i.updated_at) < b.t1) AS invoices_paid,
      (SELECT COALESCE(SUM(COALESCE(i.amount_paid, i.amount, 0)), 0)::numeric
       FROM invoices i
       INNER JOIN opportunities o ON o.id = i.opportunity_id
       INNER JOIN leads l ON l.id = o.lead_id
       , bounds b
       WHERE l.source = 'inspector'
         AND LOWER(TRIM(COALESCE(l.sub_source,''))) = $1
         AND ${PAID_INVOICE_SQL}
         AND COALESCE(i.paid_at, i.updated_at) >= b.t0
         AND COALESCE(i.paid_at, i.updated_at) < b.t1) AS total_revenue
  `;

  const r = await db.query(q, [code]);
  const row = r.rows[0] || {};
  return {
    leads: Number(row.leads ?? 0),
    opportunities_won: Number(row.opportunities_won ?? 0),
    invoices_paid: Number(row.invoices_paid ?? 0),
    total_revenue: Number(row.total_revenue ?? 0),
  };
}

module.exports = { getInspectorPerformance, PAID_INVOICE_SQL };
