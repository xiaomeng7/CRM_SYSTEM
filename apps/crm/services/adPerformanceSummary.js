/**
 * Minimal ad performance summary — joins ad_platform_daily_metrics with CRM leads/revenue.
 * Grain: v1 campaign-level for platform metrics; creative-level has no platform metrics yet (documented).
 */

const { pool } = require('../lib/db');

function parseDate(s, fallback) {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(String(s).trim())) return String(s).trim();
  return fallback;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {{
 *   by?: 'campaign'|'creative',
 *   date_from?: string,
 *   date_to?: string,
 *   platform?: string,
 *   campaign_id?: string,
 * }} q
 */
async function getAdPerformanceSummary(q = {}) {
  const by = String(q.by || 'campaign').toLowerCase() === 'creative' ? 'creative' : 'campaign';
  const today = new Date();
  const defaultTo = today.toISOString().slice(0, 10);
  const defaultFrom = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const dateTo = parseDate(q.date_to, defaultTo);
  const dateFrom = parseDate(q.date_from, defaultFrom);
  const platform = q.platform && String(q.platform).trim() ? String(q.platform).trim().toLowerCase() : null;
  const campaignId =
    q.campaign_id && String(q.campaign_id).trim() ? String(q.campaign_id).trim() : null;

  if (dateFrom > dateTo) {
    const e = new Error('date_from must be <= date_to');
    e.code = 'VALIDATION';
    throw e;
  }

  const limitations = {
    platform_metrics_grain: 'campaign_daily (ad_platform_daily_metrics)',
    creative_metrics:
      'Platform impressions/clicks/cost are not available at creative grain in v1 — use campaign grain or future ad-level sync.',
    revenue_attribution:
      'Revenue sums paid invoices on won opportunities for leads whose created_at falls in the date window (CRM join).',
    leads_count_source: 'CRM `leads` filtered by created_at::date and campaign_id / creative_id.',
  };

  if (by === 'campaign') {
    const metrics = await pool.query(
      `SELECT
         m.platform,
         m.account_external_id,
         m.campaign_external_id,
         MAX(m.campaign_id) AS campaign_id,
         SUM(m.impressions)::bigint AS impressions,
         SUM(m.clicks)::bigint AS clicks,
         SUM(m.cost)::numeric AS cost,
         SUM(COALESCE(m.conversions, 0))::numeric AS platform_conversions,
         SUM(COALESCE(m.conversion_value, 0))::numeric AS platform_conversion_value
       FROM ad_platform_daily_metrics m
       WHERE m.metric_date >= $1::date
         AND m.metric_date <= $2::date
         AND ($3::text IS NULL OR m.platform = $3)
         AND ($4::uuid IS NULL OR m.campaign_id = $4)
       GROUP BY m.platform, m.account_external_id, m.campaign_external_id`,
      [dateFrom, dateTo, platform, campaignId]
    );

    const leadStats = await pool.query(
      `SELECT
         l.campaign_id,
         COUNT(DISTINCT l.id)::bigint AS leads,
         COUNT(DISTINCT o.id) FILTER (WHERE o.id IS NOT NULL)::bigint AS opportunities
       FROM leads l
       LEFT JOIN opportunities o ON o.lead_id = l.id
       WHERE l.campaign_id IS NOT NULL
         AND l.created_at::date >= $1::date
         AND l.created_at::date <= $2::date
         AND ($3::uuid IS NULL OR l.campaign_id = $3)
       GROUP BY l.campaign_id`,
      [dateFrom, dateTo, campaignId]
    );
    const leadMap = new Map(leadStats.rows.map((r) => [String(r.campaign_id), r]));

    const revRows = await pool.query(
      `SELECT
         l.campaign_id,
         COALESCE(SUM(COALESCE(i.amount_paid, i.amount, 0)), 0)::numeric AS revenue
       FROM leads l
       INNER JOIN opportunities o ON o.lead_id = l.id AND o.stage = 'won'
       INNER JOIN invoices i ON i.opportunity_id = o.id
       WHERE l.campaign_id IS NOT NULL
         AND l.created_at::date >= $1::date
         AND l.created_at::date <= $2::date
         AND ($3::uuid IS NULL OR l.campaign_id = $3)
         AND (
           i.paid_at IS NOT NULL
           OR LOWER(TRIM(COALESCE(i.status, ''))) IN ('paid', 'complete', 'completed', 'closed')
         )
       GROUP BY l.campaign_id`,
      [dateFrom, dateTo, campaignId]
    );
    const revMap = new Map(revRows.rows.map((r) => [String(r.campaign_id), num(r.revenue)]));

    const idList = [...new Set(metrics.rows.map((r) => r.campaign_id).filter(Boolean))];
    let nameById = new Map();
    if (idList.length) {
      const names = await pool.query(`SELECT id, name, code FROM campaigns WHERE id = ANY($1::uuid[])`, [idList]);
      nameById = new Map(names.rows.map((r) => [String(r.id), { name: r.name, code: r.code }]));
    }

    const rows = metrics.rows.map((m) => {
      const cid = m.campaign_id ? String(m.campaign_id) : null;
      const ls = cid ? leadMap.get(cid) : null;
      const leads = ls ? Number(ls.leads) : 0;
      const opportunities = ls ? Number(ls.opportunities) : 0;
      const revenue = cid ? revMap.get(cid) || 0 : 0;
      const cost = num(m.cost);
      const impressions = Number(m.impressions) || 0;
      const clicks = Number(m.clicks) || 0;
      const ctr = impressions > 0 ? clicks / impressions : null;
      const cpc = clicks > 0 ? cost / clicks : null;
      const cpl = leads > 0 ? cost / leads : null;
      const cac = opportunities > 0 ? cost / opportunities : null;
      const roas = cost > 0 ? revenue / cost : null;

      const nm = cid ? nameById.get(cid) : null;
      return {
        platform: m.platform,
        account_external_id: m.account_external_id,
        campaign_external_id: m.campaign_external_id,
        campaign_id: m.campaign_id,
        campaign_name: nm?.name || null,
        campaign_code: nm?.code || null,
        creative_id: null,
        impressions,
        clicks,
        cost,
        platform_conversions: num(m.platform_conversions),
        platform_conversion_value: num(m.platform_conversion_value),
        leads,
        opportunities,
        revenue,
        ctr,
        cpc,
        cpl,
        cac,
        roas,
      };
    });

    return {
      by: 'campaign',
      date_from: dateFrom,
      date_to: dateTo,
      platform_filter: platform,
      campaign_id_filter: campaignId,
      limitations,
      rows,
    };
  }

  const creativeRows = await pool.query(
    `SELECT
       l.creative_id,
       l.campaign_id,
       COUNT(DISTINCT l.id)::bigint AS leads,
       COUNT(DISTINCT o.id) FILTER (WHERE o.id IS NOT NULL)::bigint AS opportunities
     FROM leads l
     LEFT JOIN opportunities o ON o.lead_id = l.id
     WHERE l.creative_id IS NOT NULL
       AND l.created_at::date >= $1::date
       AND l.created_at::date <= $2::date
       AND ($3::uuid IS NULL OR l.campaign_id = $3)
     GROUP BY l.creative_id, l.campaign_id`,
    [dateFrom, dateTo, campaignId]
  );

  const creativeRev = await pool.query(
    `SELECT
       l.creative_id,
       l.campaign_id,
       COALESCE(SUM(COALESCE(i.amount_paid, i.amount, 0)), 0)::numeric AS revenue
     FROM leads l
     INNER JOIN opportunities o ON o.lead_id = l.id AND o.stage = 'won'
     INNER JOIN invoices i ON i.opportunity_id = o.id
     WHERE l.creative_id IS NOT NULL
       AND l.created_at::date >= $1::date
       AND l.created_at::date <= $2::date
       AND ($3::uuid IS NULL OR l.campaign_id = $3)
       AND (
         i.paid_at IS NOT NULL
         OR LOWER(TRIM(COALESCE(i.status, ''))) IN ('paid', 'complete', 'completed', 'closed')
       )
     GROUP BY l.creative_id, l.campaign_id`,
    [dateFrom, dateTo, campaignId]
  );
  const revByCreative = new Map(
    creativeRev.rows.map((r) => [`${r.creative_id}|${r.campaign_id}`, num(r.revenue)])
  );

  const out = creativeRows.rows.map((r) => {
    const leads = Number(r.leads) || 0;
    const opportunities = Number(r.opportunities) || 0;
    const revenue = revByCreative.get(`${r.creative_id}|${r.campaign_id}`) || 0;
    return {
      platform: null,
      account_external_id: null,
      campaign_external_id: null,
      campaign_id: r.campaign_id,
      campaign_name: null,
      campaign_code: null,
      creative_id: r.creative_id,
      impressions: 0,
      clicks: 0,
      cost: 0,
      platform_conversions: 0,
      platform_conversion_value: 0,
      leads,
      opportunities,
      revenue,
      ctr: null,
      cpc: null,
      cpl: null,
      cac: opportunities > 0 ? 0 : null,
      roas: null,
      note: 'No platform spend/metrics at creative grain in v1 — cost/impressions/clicks are 0.',
    };
  });

  return {
    by: 'creative',
    date_from: dateFrom,
    date_to: dateTo,
    platform_filter: platform,
    campaign_id_filter: campaignId,
    limitations: {
      ...limitations,
      creative_cost: 'Set to 0 until ad-level metrics are synced and attributed to creative_id.',
    },
    rows: out,
  };
}

module.exports = {
  getAdPerformanceSummary,
};
