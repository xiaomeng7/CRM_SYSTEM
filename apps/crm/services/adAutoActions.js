/**
 * 半自动暂停候选：GET /api/analytics/ad-auto-actions
 * 仅返回建议列表，不执行 PATCH；与 ad-recommendations 共用阈值与部分排除规则。
 */

const { getAdPerformance } = require('./adPerformanceAnalytics');
const { listCreatives } = require('./adCreativeLibrary');
const { THRESHOLDS } = require('./adRecommendations');

const MAX_PAUSE_LIST = 5;

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
 * @param {object} [db] - optional pg pool for getAdPerformance
 */
async function getAdAutoActions(filters = {}, db) {
  const dateFrom = filters.date_from ? String(filters.date_from).trim() : null;
  const dateTo = filters.date_to ? String(filters.date_to).trim() : null;
  const productLine = filters.product_line != null ? String(filters.product_line).trim() : null;

  const perf = await getAdPerformance(
    { date_from: dateFrom, date_to: dateTo, product_line: productLine || null },
    db
  );
  const rows = perf.by_version || [];
  /** 全量创意列表，避免仅按产品线过滤时漏匹配版本标签 */
  const creatives = await listCreatives({ limit: 500 });

  const hasPaidBenchmark = rows.some((r) => (Number(r.invoices_paid) || 0) > 0);
  if (!hasPaidBenchmark) {
    return {
      pause_list: [],
      total: 0,
      truncated: false,
      cohort_note: perf.cohort_note,
    };
  }

  const candidates = [];
  for (const row of rows) {
    if (isBlankDim(row.creative_version) || isBlankDim(row.landing_page_version)) continue;

    const leads = Number(row.leads) || 0;
    const won = Number(row.opportunities_won) || 0;
    const paid = Number(row.invoices_paid) || 0;
    const wonPctRaw = row.lead_to_won_pct;
    const wonPct =
      wonPctRaw != null && !Number.isNaN(Number(wonPctRaw)) ? Number(wonPctRaw) : null;

    /** 排除 sales_issue，不进入半自动暂停列表 */
    if (won >= THRESHOLDS.sales_issue_min_opportunities_won && paid === 0) continue;

    if (
      leads < THRESHOLDS.pause_min_leads ||
      wonPct == null ||
      wonPct >= THRESHOLDS.pause_max_lead_to_won_pct ||
      paid !== 0
    ) {
      continue;
    }

    const { creative, ok } = resolveCreativeStrict(creatives, row.creative_version);
    if (!ok || !creative) continue;
    const st = String(creative.status || '').toLowerCase();
    if (st !== 'active') continue;

    candidates.push({
      row,
      creative,
      leads,
      wonPct,
      paid,
    });
  }

  candidates.sort(function (a, b) {
    if (a.wonPct !== b.wonPct) return a.wonPct - b.wonPct;
    return b.leads - a.leads;
  });

  const sliced = candidates.slice(0, MAX_PAUSE_LIST);
  const pause_list = sliced.map(function (c) {
    return {
      creative_id: c.creative.id,
      creative_version: c.row.creative_version,
      landing_page_version: c.row.landing_page_version,
      utm_campaign: c.row.utm_campaign,
      reason:
        '同统计窗口内已有带来付费的广告版本；本组合线索充足（≥' +
        THRESHOLDS.pause_min_leads +
        '）但线索→赢单率低于 ' +
        THRESHOLDS.pause_max_lead_to_won_pct +
        '% 且尚无付费，建议暂停该创意版本。',
      metrics: {
        leads: c.leads,
        lead_to_won_pct: c.wonPct,
        invoices_paid: c.paid,
      },
    };
  });

  return {
    pause_list,
    total: pause_list.length,
    truncated: candidates.length > MAX_PAUSE_LIST,
    cohort_note: perf.cohort_note,
  };
}

module.exports = {
  getAdAutoActions,
  MAX_PAUSE_LIST,
};
