const { pool } = require('../lib/db');

function parseDate(s, fallback) {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(String(s).trim())) return String(s).trim();
  return fallback;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function getLandingAttributionSummary(q = {}) {
  const today = new Date();
  const defaultTo = today.toISOString().slice(0, 10);
  const defaultFrom = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const dateTo = parseDate(q.date_to, defaultTo);
  const dateFrom = parseDate(q.date_from, defaultFrom);
  const landingVariantId =
    q.landing_variant_id && String(q.landing_variant_id).trim()
      ? String(q.landing_variant_id).trim()
      : null;
  const platform = q.platform && String(q.platform).trim() ? String(q.platform).trim().toLowerCase() : null;

  if (dateFrom > dateTo) {
    const e = new Error('date_from must be <= date_to');
    e.code = 'VALIDATION';
    throw e;
  }

  const rows = await pool.query(
    `SELECT
       lae.landing_variant_id,
       lae.platform,
       lae.campaign_id,
       COUNT(DISTINCT l.id)::bigint AS leads,
       COUNT(DISTINCT o.id) FILTER (WHERE o.id IS NOT NULL)::bigint AS opportunities,
       COALESCE(SUM(COALESCE(i.amount_paid, i.amount, 0)), 0)::numeric AS revenue
     FROM lead_attribution_events lae
     INNER JOIN leads l ON l.id = lae.lead_id
     LEFT JOIN opportunities o ON o.lead_id = l.id
     LEFT JOIN invoices i ON i.opportunity_id = o.id
       AND (
         i.paid_at IS NOT NULL
         OR LOWER(TRIM(COALESCE(i.status, ''))) IN ('paid', 'complete', 'completed', 'closed')
       )
     WHERE lae.event_type = 'lead_created'
       AND lae.landing_variant_id IS NOT NULL
       AND l.created_at::date >= $1::date
       AND l.created_at::date <= $2::date
       AND ($3::uuid IS NULL OR lae.landing_variant_id = $3::uuid)
       AND ($4::text IS NULL OR lae.platform = $4)
     GROUP BY lae.landing_variant_id, lae.platform, lae.campaign_id
     ORDER BY leads DESC, revenue DESC`,
    [dateFrom, dateTo, landingVariantId, platform]
  );

  return {
    date_from: dateFrom,
    date_to: dateTo,
    landing_variant_id_filter: landingVariantId,
    platform_filter: platform,
    limitations: {
      revenue_attribution:
        'Revenue is CRM-side paid invoice sum on opportunities linked to attributed leads; not click-date attribution.',
      experiment_status:
        'This endpoint is recording/attribution visibility only, not automated traffic split or winner selection.',
    },
    rows: rows.rows.map((r) => ({
      landing_variant_id: r.landing_variant_id,
      platform: r.platform,
      campaign_id: r.campaign_id,
      leads: Number(r.leads) || 0,
      opportunities: Number(r.opportunities) || 0,
      revenue: num(r.revenue),
    })),
  };
}

module.exports = {
  getLandingAttributionSummary,
};
