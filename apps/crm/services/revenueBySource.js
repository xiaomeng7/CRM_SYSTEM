/**
 * Revenue by lead source group (Google Ads landing vs inspector vs manual/referral).
 * Grain: leads created in [date_from, date_to]; revenue = paid invoices on won opps for those leads.
 */

const { pool } = require('../lib/db');

const SOURCE_GROUPS = ['google_ads', 'inspector', 'manual'];

function parseDate(s, fallback) {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(String(s).trim())) return String(s).trim();
  return fallback;
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

function roundMoney(x) {
  return Math.round(Number(x) * 100) / 100;
}

/**
 * @param {{ date_from?: string, date_to?: string }} q
 */
async function getRevenueBySource(q = {}) {
  const today = new Date();
  const defaultTo = today.toISOString().slice(0, 10);
  const defaultFrom = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const dateTo = parseDate(q.date_to, defaultTo);
  const dateFrom = parseDate(q.date_from, defaultFrom);

  if (dateFrom > dateTo) {
    const e = new Error('date_from must be <= date_to');
    e.code = 'VALIDATION';
    throw e;
  }

  const { rows } = await pool.query(
    `WITH lead_scoped AS (
       SELECT
         l.id,
         CASE
           WHEN l.source ILIKE 'landing:%' THEN 'google_ads'
           WHEN LOWER(TRIM(COALESCE(l.source, ''))) = 'inspector' THEN 'inspector'
           WHEN LOWER(TRIM(COALESCE(l.source, ''))) IN ('manual', 'referral') THEN 'manual'
         END AS source_group
       FROM leads l
       WHERE l.created_at::date >= $1::date
         AND l.created_at::date <= $2::date
         AND (
           l.source ILIKE 'landing:%'
           OR LOWER(TRIM(COALESCE(l.source, ''))) = 'inspector'
           OR LOWER(TRIM(COALESCE(l.source, ''))) IN ('manual', 'referral')
         )
     ),
     leads_agg AS (
       SELECT source_group, COUNT(*)::bigint AS leads
       FROM lead_scoped
       GROUP BY source_group
     ),
     won_agg AS (
       SELECT ls.source_group, COUNT(DISTINCT o.id)::bigint AS opportunities_won
       FROM lead_scoped ls
       INNER JOIN opportunities o ON o.lead_id = ls.id AND o.stage = 'won'
       GROUP BY ls.source_group
     ),
     paid_agg AS (
       SELECT
         ls.source_group,
         COUNT(DISTINCT i.id)::bigint AS invoices_paid,
         COALESCE(SUM(COALESCE(i.amount_paid, i.amount, 0)), 0)::numeric AS total_revenue
       FROM lead_scoped ls
       INNER JOIN opportunities o ON o.lead_id = ls.id AND o.stage = 'won'
       INNER JOIN invoices i ON i.opportunity_id = o.id
         AND (
           i.paid_at IS NOT NULL
           OR LOWER(TRIM(COALESCE(i.status, ''))) IN ('paid', 'complete', 'completed', 'closed')
         )
       GROUP BY ls.source_group
     )
     SELECT
       g.sg AS source_group,
       COALESCE(la.leads, 0)::bigint AS leads,
       COALESCE(wa.opportunities_won, 0)::bigint AS opportunities_won,
       COALESCE(pa.invoices_paid, 0)::bigint AS invoices_paid,
       COALESCE(pa.total_revenue, 0)::numeric AS total_revenue
     FROM (SELECT unnest($3::text[]) AS sg) g
     LEFT JOIN leads_agg la ON la.source_group = g.sg
     LEFT JOIN won_agg wa ON wa.source_group = g.sg
     LEFT JOIN paid_agg pa ON pa.source_group = g.sg
     ORDER BY
       CASE g.sg
         WHEN 'google_ads' THEN 1
         WHEN 'inspector' THEN 2
         WHEN 'manual' THEN 3
         ELSE 4
       END`,
    [dateFrom, dateTo, SOURCE_GROUPS]
  );

  const by_source = rows.map((r) => {
    const leads = Number(r.leads) || 0;
    const opportunities_won = Number(r.opportunities_won) || 0;
    const invoices_paid = Number(r.invoices_paid) || 0;
    const total_revenue = roundMoney(r.total_revenue);
    const avg_revenue_per_lead = leads > 0 ? roundMoney(total_revenue / leads) : 0;
    const lead_to_paid_pct = leads > 0 ? round1((100 * invoices_paid) / leads) : 0;
    return {
      source_group: r.source_group,
      leads,
      opportunities_won,
      invoices_paid,
      total_revenue,
      avg_revenue_per_lead,
      lead_to_paid_pct,
    };
  });

  return {
    date_from: dateFrom,
    date_to: dateTo,
    by_source,
  };
}

module.exports = {
  getRevenueBySource,
  SOURCE_GROUPS,
};
