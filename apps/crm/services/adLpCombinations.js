/**
 * Ad creative × landing page version combinations + mismatch hints (GET /api/analytics/ad-lp-combinations).
 * Reuses ad performance cohort (same date / product_line semantics).
 */

const { getAdPerformance } = require('./adPerformanceAnalytics');

const MIN_LEADS_PER_LPV = 5;
const MISMATCH_MIN_GAP_PCT = 10;

function conversionRatePct(leads, won) {
  const L = Number(leads) || 0;
  const W = Number(won) || 0;
  if (L <= 0) return 0;
  return Math.round((100 * W) / L);
}

/**
 * @param {object} filters - { date_from, date_to, product_line?, db? }
 */
async function getAdLpCombinations(filters = {}, db) {
  const perf = await getAdPerformance(filters, db);
  const byVersion = perf.by_version || [];

  const combinations = byVersion.map((r) => {
    const leads = Number(r.leads) || 0;
    const won = Number(r.opportunities_won) || 0;
    const paid = Number(r.invoices_paid) || 0;
    return {
      creative_version: r.creative_version,
      landing_page_version: r.landing_page_version,
      utm_campaign: r.utm_campaign,
      leads,
      opportunities_won: won,
      invoices_paid: paid,
      conversion_rate: conversionRatePct(leads, won),
    };
  });

  const best_combinations = combinations
    .filter((c) => (Number(c.invoices_paid) || 0) >= 2)
    .sort((a, b) => {
      if (b.conversion_rate !== a.conversion_rate) return b.conversion_rate - a.conversion_rate;
      return (Number(b.leads) || 0) - (Number(a.leads) || 0);
    });

  const mismatches = computeMismatches(combinations);

  return {
    date_from: perf.date_from,
    date_to: perf.date_to,
    product_line: perf.product_line,
    combinations,
    best_combinations,
    mismatches,
  };
}

/**
 * Same (creative_version, utm_campaign): if two+ lpv each with enough leads,
 * and best vs worst conversion_rate differs by > 10 points → mismatch.
 */
function computeMismatches(combinations) {
  const byKey = new Map();
  for (const c of combinations) {
    const cv = c.creative_version == null ? '' : String(c.creative_version).trim();
    const utm = c.utm_campaign == null ? '' : String(c.utm_campaign).trim();
    const lpv = c.landing_page_version == null ? '' : String(c.landing_page_version).trim();
    if (!cv || !utm || !lpv) continue;
    const k = `${cv}\0${utm}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(c);
  }

  const out = [];
  for (const [, rows] of byKey) {
    const qualified = rows.filter((r) => (Number(r.leads) || 0) >= MIN_LEADS_PER_LPV);
    if (qualified.length < 2) continue;

    let best = qualified[0];
    let worst = qualified[0];
    for (const r of qualified) {
      if (r.conversion_rate > best.conversion_rate) best = r;
      if (r.conversion_rate < worst.conversion_rate) worst = r;
    }
    if (String(best.landing_page_version) === String(worst.landing_page_version)) continue;
    const gap = best.conversion_rate - worst.conversion_rate;
    if (gap <= MISMATCH_MIN_GAP_PCT) continue;

    out.push({
      type: 'mismatch',
      creative_version: best.creative_version,
      utm_campaign: best.utm_campaign,
      better_lpv: best.landing_page_version,
      worse_lpv: worst.landing_page_version,
      better_conversion_rate: best.conversion_rate,
      worse_conversion_rate: worst.conversion_rate,
      recommendation: 'use_better_landing_page',
    });
  }

  out.sort(
    (a, b) =>
      b.better_conversion_rate -
      b.worse_conversion_rate -
      (a.better_conversion_rate - a.worse_conversion_rate)
  );
  return out;
}


module.exports = {
  getAdLpCombinations,
  MIN_LEADS_PER_LPV,
  MISMATCH_MIN_GAP_PCT,
};
