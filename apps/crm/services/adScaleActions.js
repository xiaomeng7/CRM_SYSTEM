/**
 * 半自动放大候选：GET /api/analytics/ad-scale-actions
 * 仅返回建议列表，不改预算、不调外部广告 API。
 */

const { getAdPerformance } = require('./adPerformanceAnalytics');
const { listCreatives } = require('./adCreativeLibrary');
const { THRESHOLDS } = require('./adRecommendations');

const MAX_SCALE_LIST = 5;

function isBlankDim(v) {
  return v == null || String(v).trim() === '';
}

function resolveCreativeStrict(creatives, cv) {
  const v = String(cv == null ? '' : cv).trim();
  if (!v) return { creative: null, ok: false };
  const list = creatives.filter((c) => String(c.version || '').trim() === v);
  if (list.length === 0) return { creative: null, ok: false };
  if (list.length > 1) return { creative: null, ok: false };
  return { creative: list[0], ok: true };
}

/**
 * @param {object} filters - { date_from, date_to, product_line? }
 * @param {object} [db]
 */
async function getAdScaleActions(filters = {}, db) {
  const dateFrom = filters.date_from ? String(filters.date_from).trim() : null;
  const dateTo = filters.date_to ? String(filters.date_to).trim() : null;
  const productLine = filters.product_line != null ? String(filters.product_line).trim() : null;

  const perf = await getAdPerformance(
    { date_from: dateFrom, date_to: dateTo, product_line: productLine || null },
    db
  );
  const rows = perf.by_version || [];
  const creatives = await listCreatives({ limit: 500 });

  const minPaid = THRESHOLDS.scale_min_invoices_paid;
  const minWonPct = THRESHOLDS.scale_min_lead_to_won_pct;

  const candidates = [];
  for (const row of rows) {
    if (isBlankDim(row.creative_version) || isBlankDim(row.landing_page_version)) continue;

    const leads = Number(row.leads) || 0;
    const won = Number(row.opportunities_won) || 0;
    const paid = Number(row.invoices_paid) || 0;
    const wonPctRaw = row.lead_to_won_pct;
    const wonPct =
      wonPctRaw != null && !Number.isNaN(Number(wonPctRaw)) ? Number(wonPctRaw) : null;

    if (paid < minPaid || wonPct == null || wonPct < minWonPct) continue;

    const { creative, ok } = resolveCreativeStrict(creatives, row.creative_version);
    if (!ok || !creative) continue;
    const st = String(creative.status || '').toLowerCase();
    if (st !== 'active') continue;

    const totalPaid = Number(row.total_paid_value) || 0;
    candidates.push({ row, creative, leads, won, paid, wonPct, totalPaid });
  }

  candidates.sort(function (a, b) {
    if (b.paid !== a.paid) return b.paid - a.paid;
    return b.totalPaid - a.totalPaid;
  });

  const sliced = candidates.slice(0, MAX_SCALE_LIST);
  const scale_list = sliced.map(function (c) {
    const tp = c.row.total_paid_value;
    const totalPaidVal = tp != null && !Number.isNaN(Number(tp)) ? Number(tp) : c.totalPaid;
    return {
      creative_id: c.creative.id,
      creative_version: c.row.creative_version,
      landing_page_version: c.row.landing_page_version,
      utm_campaign: c.row.utm_campaign,
      reason:
        '已付发票≥' +
        minPaid +
        ' 且线索→赢单率≥' +
        minWonPct +
        '%，创意为投放中；建议保持预算或复制新版本做 A/B 测试。',
      metrics: {
        leads: c.leads,
        lead_to_won_pct: Math.round(c.wonPct * 10) / 10,
        invoices_paid: c.paid,
        total_paid_value: Math.round(totalPaidVal * 100) / 100,
        opportunities_won: c.won,
      },
    };
  });

  return {
    scale_list,
    total: scale_list.length,
    truncated: candidates.length > MAX_SCALE_LIST,
    cohort_note: perf.cohort_note,
  };
}

module.exports = {
  getAdScaleActions,
  MAX_SCALE_LIST,
};
