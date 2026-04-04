/**
 * Ad auto-recommendations (V1) for Growth Dashboard.
 * Reuses getAdPerformance cohort rows + getConversionPerformance gclid_quality mix.
 *
 * Thresholds are centralized in THRESHOLDS — adjust here only.
 */

const { getAdPerformance } = require('./adPerformanceAnalytics');
const { getConversionPerformance } = require('./conversionPerformance');

/**
 * V1 rule knobs (all in one place for ops/engineering).
 */
const THRESHOLDS = {
  /** A: observe — sample too small */
  observe_min_leads: 8,
  /** B: pause */
  pause_min_leads: 10,
  pause_max_lead_to_won_pct: 10,
  /** C: observe_normal */
  observe_normal_min_leads: 8,
  observe_normal_min_won_pct: 10,
  observe_normal_max_invoices_paid: 1,
  /** D: scale */
  scale_min_invoices_paid: 2,
  scale_min_lead_to_won_pct: 20,
  /** E: fork */
  fork_min_invoices_paid: 2,
  /** G: sales_issue */
  sales_issue_min_opportunities_won: 5,
  /** F: window-level gclid quality (offline queue, same date window as conversion-performance) */
  gclid_window_min_rows: 8,
  /** Share of rows where gclid_quality is not high/medium → flag window tracking_issue */
  gclid_low_or_unknown_max_share: 0.45,
};

function isBlankDim(v) {
  return v == null || String(v).trim() === '';
}

/**
 * Aggregate google_offline_conversion_events gclid_quality rows from conversion-performance.
 * @param {Array<{ event_type: string, gclid_quality: string|null, n: string|number }>} rows
 */
function assessWindowGclidQuality(rows) {
  let total = 0;
  let lowOrUnknown = 0;
  for (const r of rows || []) {
    const n = Number(r.n) || 0;
    if (n <= 0) continue;
    total += n;
    const q = String(r.gclid_quality || '').toLowerCase();
    if (q !== 'high' && q !== 'medium') lowOrUnknown += n;
  }
  if (total < THRESHOLDS.gclid_window_min_rows) {
    return { flag: false, total, low_or_unknown: lowOrUnknown, low_share: null };
  }
  const lowShare = lowOrUnknown / total;
  return {
    flag: lowShare >= THRESHOLDS.gclid_low_or_unknown_max_share,
    total,
    low_or_unknown: lowOrUnknown,
    low_share: Math.round(lowShare * 10000) / 100,
  };
}

function baseDims(row) {
  return {
    creative_version: row.creative_version,
    landing_page_version: row.landing_page_version,
    utm_campaign: row.utm_campaign,
  };
}

/**
 * One primary recommendation per ad-performance bucket (V1 priority stack).
 */
function recommendForBucket(row) {
  const leads = Number(row.leads) || 0;
  const won = Number(row.opportunities_won) || 0;
  const paid = Number(row.invoices_paid) || 0;
  const wonPctRaw = row.lead_to_won_pct;
  const wonPct = wonPctRaw != null && !Number.isNaN(Number(wonPctRaw)) ? Number(wonPctRaw) : null;

  const dims = baseDims(row);

  if (isBlankDim(row.creative_version) || isBlankDim(row.landing_page_version)) {
    return {
      type: 'tracking_issue',
      severity: 'medium',
      ...dims,
      reason: '缺少 creative_version（cv）或 landing_page_version（lpv），归因分桶不完整，请检查投放链接与落地页传参。',
      action_label: '检查链接参数',
      rule_id: 'F_missing_cv_lpv',
    };
  }

  if (won >= THRESHOLDS.sales_issue_min_opportunities_won && paid === 0) {
    return {
      type: 'sales_issue',
      severity: 'high',
      ...dims,
      reason:
        '该组合已有 ' +
        won +
        ' 个赢单机会，但尚无已付发票，可能存在跟单或收款环节问题。',
      action_label: '检查销售跟进与收款',
      rule_id: 'G_won_no_paid',
    };
  }

  if (
    leads >= THRESHOLDS.pause_min_leads &&
    wonPct != null &&
    wonPct < THRESHOLDS.pause_max_lead_to_won_pct &&
    paid === 0
  ) {
    return {
      type: 'pause',
      severity: 'high',
      ...dims,
      reason:
        '线索量已足（≥' +
        THRESHOLDS.pause_min_leads +
        '），但线索→赢单率低于 ' +
        THRESHOLDS.pause_max_lead_to_won_pct +
        '%，且尚无付费转化。',
      action_label: '暂停这个版本',
      rule_id: 'B_pause_poor_funnel',
    };
  }

  if (
    paid >= THRESHOLDS.scale_min_invoices_paid &&
    wonPct != null &&
    wonPct >= THRESHOLDS.scale_min_lead_to_won_pct
  ) {
    return {
      type: 'scale',
      severity: 'low',
      ...dims,
      reason:
        '已有 ' +
        paid +
        ' 笔付费且线索→赢单率 ≥ ' +
        THRESHOLDS.scale_min_lead_to_won_pct +
        '%，表现突出。',
      action_label: '建议继续投放',
      rule_id: 'D_scale',
    };
  }

  if (paid >= THRESHOLDS.fork_min_invoices_paid) {
    return {
      type: 'fork',
      severity: 'medium',
      ...dims,
      reason: '已有 ' + paid + ' 笔付费，可在保留本版的同时复制出新版本做 A/B。',
      action_label: '复制版本继续测试',
      rule_id: 'E_fork_has_paid',
    };
  }

  if (leads < THRESHOLDS.observe_min_leads) {
    return {
      type: 'observe',
      severity: 'low',
      ...dims,
      reason: '当前线索数少于 ' + THRESHOLDS.observe_min_leads + '，统计波动大，数据不足。',
      action_label: '继续观察',
      rule_id: 'A_observe_low_n',
    };
  }

  if (
    leads >= THRESHOLDS.observe_normal_min_leads &&
    wonPct != null &&
    wonPct >= THRESHOLDS.observe_normal_min_won_pct &&
    paid <= THRESHOLDS.observe_normal_max_invoices_paid
  ) {
    return {
      type: 'observe',
      severity: 'low',
      ...dims,
      reason:
        '线索→赢单率 ≥ ' +
        THRESHOLDS.observe_normal_min_won_pct +
        '%，且付费笔数不超过 ' +
        THRESHOLDS.observe_normal_max_invoices_paid +
        '，整体正常。',
      action_label: '表现正常，继续观察',
      rule_id: 'C_observe_normal',
    };
  }

  return {
    type: 'observe',
    severity: 'low',
    ...dims,
    reason: '暂不符合暂停/放量/复制等强规则，建议结合业务节奏继续观察。',
    action_label: '继续观察',
    rule_id: 'fallback_observe',
  };
}

function windowTrackingRecommendation(gclidAssessment) {
  if (!gclidAssessment.flag) return null;
  return {
    type: 'tracking_issue',
    severity: 'medium',
    creative_version: null,
    landing_page_version: null,
    utm_campaign: null,
    reason:
      '窗口内离线转化队列中，约 ' +
      (gclidAssessment.low_share != null ? gclidAssessment.low_share + '%' : '较高比例') +
      ' 的事件 gclid 质量为低或未知（high/medium 以外），可能影响上传与建模。',
    action_label: '检查 gclid 采集与上传',
    rule_id: 'F_window_gclid_quality',
    scope: 'cohort_window',
    metrics: {
      offline_rows: gclidAssessment.total,
      low_or_unknown_rows: gclidAssessment.low_or_unknown,
      low_share_pct: gclidAssessment.low_share,
    },
  };
}

/**
 * @param {object} filters - { date_from, date_to, product_line?, db? }
 */
async function getAdRecommendations(filters = {}, db) {
  const dateFrom = filters.date_from ? String(filters.date_from).trim() : null;
  const dateTo = filters.date_to ? String(filters.date_to).trim() : null;
  const productLine = filters.product_line != null ? String(filters.product_line).trim() : null;

  const [perf, conv] = await Promise.all([
    getAdPerformance({ date_from: dateFrom, date_to: dateTo, product_line: productLine || null }, db),
    getConversionPerformance({ date_from: dateFrom, date_to: dateTo }, db),
  ]);

  const gclidAssessment = assessWindowGclidQuality(conv.gclid_quality_by_event_type || []);
  const windowRec = windowTrackingRecommendation(gclidAssessment);

  const byVersion = perf.by_version || [];
  const recommendations = byVersion.map((row) => recommendForBucket(row));
  if (windowRec) recommendations.push(windowRec);

  return {
    date_from: dateFrom,
    date_to: dateTo,
    product_line: productLine || null,
    cohort_note: perf.cohort_note,
    thresholds: THRESHOLDS,
    window_signals: {
      gclid_quality_flag: gclidAssessment.flag,
      gclid_offline_rows: gclidAssessment.total,
      gclid_low_or_unknown_share_pct: gclidAssessment.low_share,
    },
    recommendations,
  };
}

module.exports = {
  getAdRecommendations,
  THRESHOLDS,
};
