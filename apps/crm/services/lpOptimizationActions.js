/**
 * Landing page semi-auto optimization candidates — GET /api/analytics/lp-optimization-actions
 * Compares aggregated (lpv × utm) buckets; does not modify rows.
 */

const { getAdPerformance } = require('./adPerformanceAnalytics');
const { listVersions } = require('./landingPageVersionLibrary');

const MIN_BAD_LEADS = 10;
const MAX_BAD_WON_PCT = 15;
const MIN_PEER_LEADS = 5;
const MIN_PEER_WON_PCT = 15;
const MAX_LIST = 15;

function trim(v) {
  return v == null ? '' : String(v).trim();
}

function normDim(v) {
  const t = trim(v);
  return t === '' ? null : t;
}

function indexLandingPagesByVersion(rows) {
  const m = new Map();
  for (const row of rows || []) {
    const v = trim(row.version);
    if (!v) continue;
    const prev = m.get(v);
    if (!prev) {
      m.set(v, row);
      continue;
    }
    const ta = row.updated_at ? new Date(row.updated_at).getTime() : 0;
    const tb = prev.updated_at ? new Date(prev.updated_at).getTime() : 0;
    if (ta >= tb) m.set(v, row);
  }
  return m;
}

function aggregateByLpUtm(byVersion) {
  const m = new Map();
  for (const r of byVersion || []) {
    const lpv = normDim(r.landing_page_version);
    const utm = normDim(r.utm_campaign);
    if (!lpv || !utm) continue;
    const k = `${lpv}\0${utm}`;
    const cur = m.get(k);
    const leads = Number(r.leads) || 0;
    if (!cur || leads > (Number(cur.leads) || 0)) m.set(k, r);
  }
  return [...m.values()];
}

/**
 * 参考更好版本结构 + product_line 强化风险/收益（落地页英文主文案，与创意规则风格一致）。
 */
function buildSuggestedLpEdits(betterLp, worseLp, productLine) {
  const pl = String(productLine || 'energy').toLowerCase();
  const h0 = trim(betterLp?.headline) || 'Book your electrical assessment';
  const s0 = trim(betterLp?.subheadline) || '';
  const c0 = trim(betterLp?.cta_text) || 'Book now';

  let riskLine;
  if (pl === 'pre_purchase') {
    riskLine = 'Avoid $5k+ surprises before settlement — independent, licensed review.';
  } else if (pl === 'rental') {
    riskLine = 'Reduce landlord liability with documented safety & compliance clarity.';
  } else {
    riskLine = 'Cut bill waste and spot errors — independent read, no sales pressure.';
  }

  const headline =
    h0.length > 72
      ? `Stronger offer: ${h0.slice(0, 60).replace(/\s+$/, '')}…`
      : `Stronger offer: ${h0}`;

  const subheadline = s0 ? `${s0} ${riskLine}` : riskLine;

  const ctaText =
    c0.length > 40
      ? `${c0} — limited slots`
      : `${c0} — see availability this week`;

  return {
    headline,
    subheadline,
    cta_text: ctaText,
  };
}

/**
 * @param {object} filters - { date_from, date_to, product_line? }
 */
async function getLpOptimizationActions(filters = {}, db) {
  const dateFrom = filters.date_from ? String(filters.date_from).trim() : null;
  const dateTo = filters.date_to ? String(filters.date_to).trim() : null;
  const productLine = filters.product_line != null ? String(filters.product_line).trim() : null;

  const perf = await getAdPerformance(
    { date_from: dateFrom, date_to: dateTo, product_line: productLine || null },
    db
  );
  const lpRows = await listVersions({ limit: 500 });
  const lpByVersion = indexLandingPagesByVersion(lpRows);

  const agg = aggregateByLpUtm(perf.by_version || []);

  const candidates = [];

  for (const r of agg) {
    const lpv = normDim(r.landing_page_version);
    const utm = normDim(r.utm_campaign);
    const leads = Number(r.leads) || 0;
    const pct = r.lead_to_won_pct != null && !Number.isNaN(Number(r.lead_to_won_pct)) ? Number(r.lead_to_won_pct) : null;

    if (leads < MIN_BAD_LEADS || pct == null || pct >= MAX_BAD_WON_PCT) continue;

    const badLp = lpByVersion.get(lpv);
    if (!badLp || !badLp.id) continue;
    const badPl = trim(badLp.product_line).toLowerCase();

    const peerPool = [];

    for (const p of agg) {
      const plpv = normDim(p.landing_page_version);
      const putm = normDim(p.utm_campaign);
      if (!plpv || plpv === lpv) continue;
      const pLeads = Number(p.leads) || 0;
      const pPct =
        p.lead_to_won_pct != null && !Number.isNaN(Number(p.lead_to_won_pct))
          ? Number(p.lead_to_won_pct)
          : null;
      if (pLeads < MIN_PEER_LEADS || pPct == null) continue;
      if (pPct <= pct || pPct < MIN_PEER_WON_PCT) continue;

      const sameUtm = putm === utm;
      const peerLp = lpByVersion.get(plpv);
      const peerPl = peerLp ? trim(peerLp.product_line).toLowerCase() : '';
      const samePl = peerPl && peerPl === badPl;

      if ((sameUtm || samePl) && peerLp && peerLp.id) {
        peerPool.push({ row: p, lp: peerLp, pPct, sameUtm, samePl });
      }
    }

    if (!peerPool.length) continue;

    peerPool.sort(function (a, b) {
      return b.pPct - a.pPct;
    });
    const best = peerPool[0];
    const betterLpv = normDim(best.row.landing_page_version);
    const betterLp = best.lp || lpByVersion.get(betterLpv);
    if (!betterLp) continue;

    const gap = best.pPct - pct;
    const suggested_edits = buildSuggestedLpEdits(betterLp, badLp, badPl);

    candidates.push({
      landing_page_version: lpv,
      better_version: betterLpv,
      lead_to_won_pct: Math.round(pct * 10) / 10,
      better_lead_to_won_pct: Math.round(best.pPct * 10) / 10,
      gap,
      utm_campaign: utm,
      product_line: badPl,
      reason: '转化明显低于同类版本（同活动或同产品线存在更高转化落地页）。',
      source_landing_page_id: badLp.id,
      reference_landing_page_id: betterLp.id,
      suggested_edits: suggested_edits,
    });
  }

  const seen = new Set();
  const deduped = [];
  for (const c of candidates) {
    const k = `${c.landing_page_version}\0${c.utm_campaign}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(c);
  }

  deduped.sort(function (a, b) {
    return b.gap - a.gap;
  });

  const lp_optimization_list = deduped.slice(0, MAX_LIST).map(function (c) {
    return {
      landing_page_version: c.landing_page_version,
      better_version: c.better_version,
      lead_to_won_pct: c.lead_to_won_pct,
      better_lead_to_won_pct: c.better_lead_to_won_pct,
      reason: c.reason,
      utm_campaign: c.utm_campaign,
      product_line: c.product_line,
      source_landing_page_id: c.source_landing_page_id,
      reference_landing_page_id: c.reference_landing_page_id,
      suggested_edits: c.suggested_edits,
    };
  });

  return {
    lp_optimization_list,
    total: lp_optimization_list.length,
    cohort_note: perf.cohort_note,
  };
}

module.exports = {
  getLpOptimizationActions,
  buildSuggestedLpEdits,
};
