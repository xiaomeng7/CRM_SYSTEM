/**
 * Growth Intelligence Engine — strategy layer for Electrical Risk & Energy Advisory.
 *
 * Optimises for: high-quality leads, revenue per lead, filtering low-intent traffic.
 * Does NOT: call OpenAI, mutate the database schema, publish ads, or maximise clicks/leads.
 *
 * Rule rationale is documented inline and in RULES_README below.
 */

const { pool } = require('../lib/db');

/** Minimum leads before drawing funnel conclusions (avoid noise). */
const MIN_LEADS_FOR_CAMPAIGN_RULES = 12;

/** “Many leads” threshold for volume-based rules. */
const HIGH_VOLUME_LEADS = 25;

/** Score ≥ this (0–100) counts as “high-intent / advisory-fit” proxy. */
const HIGH_SCORE_THRESHOLD = 65;

/** Score < this counts as “likely price / repair / low-fit” proxy. */
const LOW_SCORE_THRESHOLD = 40;

/** conversion_rate in ROI view = wins/leads; “healthy” funnel for advisory upsell. */
const STRONG_CONVERSION_RATE = 0.06;

/** revenue_per_lead in AUD — signals economically attractive traffic (tune per business). */
const STRONG_REVENUE_PER_LEAD = 400;

/** If revenue_per_lead below this with volume, traffic likely diluting economics. */
const WEAK_REVENUE_PER_LEAD = 120;

/** If many leads but revenue under this (total), “leads多收入低” pattern. */
const WEAK_TOTAL_REVENUE = 2500;

/** High-score share below this with volume → wrong audience / bait messaging. */
const LOW_HIGH_SCORE_SHARE = 0.18;

/**
 * RULES_README (why each rule exists)
 *
 * R1 — Low quality traffic (high leads, weak revenue / RPL):
 *   Aligns with “not maximising lead count”. Volume without paid advisory outcomes
 *   usually means repair shoppers or price-sensitive clicks — tighten funnel.
 *
 * R2 — Scale winners (high conversion + strong RPL):
 *   Doubles down only when funnel quality and economics already prove out — not CTR.
 *
 * R3 — Volume without high scores:
 *   If ads pull many leads but few score highly, creative/keywords likely attract
 *   the wrong jobs (urgent fix, cheap sparky) vs. bills/solar/advisory narrative.
 *
 * R4 — Landing proxy (scores + conversion):
 *   Without GA4, lead_score distribution + win rate proxies whether the page
 *   qualifies visitors or invites tyre-kickers.
 *
 * R5 — UTM-only / no cost join:
 *   From schema design: utm-only buckets don’t receive campaign_costs — warn ops
 *   so ROI decisions aren’t made on incomplete cost data.
 *
 * R6 — Variant hygiene:
 *   Many drafts stuck in draft may mean strategy churn without shipping learning;
 *   informational only, not execution.
 */

const COMPANY_FRAME = {
  positioning:
    'Independent electrical risk and energy advisory — not a tradie job shop. Decision support and reports; avoid small repair and price-shopping demand.',
  copy_principles: [
    'State independence and advisory scope explicitly.',
    'Disqualify: emergency repairs, “cheapest quote”, single small jobs.',
    'Attract: high bills, solar/battery decisions, investors, compliance clarity.',
  ],
};

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normUtm(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

/**
 * Future: GA4 Data API / BigQuery — page engagement, form start/submit, drop-off.
 * @returns {Promise<{ available: boolean, sessionsByPageKey: Record<string, unknown>, note: string }>}
 */
async function fetchGa4BehaviorContext() {
  return {
    available: false,
    sessionsByPageKey: {},
    note: 'GA4 not wired in CRM v1; use lead_score distribution and conversion as proxies.',
  };
}

/**
 * @param {import('pg').Pool} [db]
 */
async function fetchCampaignRoiRows(db = pool) {
  try {
    const r = await db.query(
      `SELECT * FROM v_campaign_roi_summary ORDER BY leads DESC NULLS LAST, revenue DESC NULLS LAST`
    );
    return r.rows || [];
  } catch (e) {
    if (/does not exist/i.test(e.message || '')) {
      console.warn('[growth-intelligence] v_campaign_roi_summary missing:', e.message);
      return [];
    }
    throw e;
  }
}

/**
 * Scores grouped by internal campaign_id (cost-attributed path).
 * @param {import('pg').Pool} db
 */
async function fetchLeadScoreStatsByCampaignId(db = pool) {
  try {
    const r = await db.query(
      `SELECT
         l.campaign_id,
         COUNT(*)::int AS lead_count,
         AVG(vls.score)::float AS avg_score,
         COUNT(*) FILTER (WHERE vls.score IS NOT NULL AND vls.score >= $1)::int AS high_score_leads,
         COUNT(*) FILTER (WHERE vls.score IS NOT NULL AND vls.score < $2)::int AS low_score_leads,
         COUNT(*) FILTER (WHERE vls.score IS NULL)::int AS unscored_leads
       FROM leads l
       LEFT JOIN v_latest_lead_scores vls ON vls.lead_id = l.id
       WHERE l.campaign_id IS NOT NULL
         AND l.created_at >= NOW() - INTERVAL '120 days'
       GROUP BY l.campaign_id`,
      [HIGH_SCORE_THRESHOLD, LOW_SCORE_THRESHOLD]
    );
    const map = new Map();
    for (const row of r.rows || []) {
      map.set(String(row.campaign_id), row);
    }
    return map;
  } catch (e) {
    if (/does not exist|v_latest_lead_scores/i.test(e.message || '')) {
      console.warn('[growth-intelligence] lead score stats (by campaign) skipped:', e.message);
      return new Map();
    }
    throw e;
  }
}

/**
 * UTM-only leads (no campaign_id) — aligns with ROI “u:” buckets.
 * @param {import('pg').Pool} db
 */
async function fetchLeadScoreStatsByUtm(db = pool) {
  try {
    const r = await db.query(
      `SELECT
         NULLIF(TRIM(l.utm_campaign), '') AS utm_campaign,
         COUNT(*)::int AS lead_count,
         AVG(vls.score)::float AS avg_score,
         COUNT(*) FILTER (WHERE vls.score IS NOT NULL AND vls.score >= $1)::int AS high_score_leads,
         COUNT(*) FILTER (WHERE vls.score IS NOT NULL AND vls.score < $2)::int AS low_score_leads,
         COUNT(*) FILTER (WHERE vls.score IS NULL)::int AS unscored_leads
       FROM leads l
       LEFT JOIN v_latest_lead_scores vls ON vls.lead_id = l.id
       WHERE l.campaign_id IS NULL
         AND NULLIF(TRIM(l.utm_campaign), '') IS NOT NULL
         AND l.created_at >= NOW() - INTERVAL '120 days'
       GROUP BY NULLIF(TRIM(l.utm_campaign), '')`,
      [HIGH_SCORE_THRESHOLD, LOW_SCORE_THRESHOLD]
    );
    const map = new Map();
    for (const row of r.rows || []) {
      map.set(normUtm(row.utm_campaign), row);
    }
    return map;
  } catch (e) {
    console.warn('[growth-intelligence] lead score stats (by utm) skipped:', e.message);
    return new Map();
  }
}

/**
 * Light context: recent variants per campaign (no content generation).
 * @param {import('pg').Pool} db
 */
async function fetchVariantSummary(db = pool) {
  const empty = { ad_variants_by_campaign: {}, landing_variants_by_campaign: {} };
  try {
    const [ads, lps] = await Promise.all([
      db.query(
        `SELECT campaign_id, status, COUNT(*)::int AS n
         FROM ad_variants
         WHERE campaign_id IS NOT NULL AND created_at >= NOW() - INTERVAL '180 days'
         GROUP BY campaign_id, status`
      ),
      db.query(
        `SELECT campaign_id, status, COUNT(*)::int AS n
         FROM landing_page_variants
         WHERE campaign_id IS NOT NULL AND created_at >= NOW() - INTERVAL '180 days'
         GROUP BY campaign_id, status`
      ),
    ]);
    const byC = {};
    for (const row of ads.rows || []) {
      const id = String(row.campaign_id);
      if (!byC[id]) byC[id] = { draft: 0, approved: 0, rejected: 0, other: 0 };
      const st = String(row.status || '').toLowerCase();
      if (st === 'draft') byC[id].draft += row.n;
      else if (st === 'approved') byC[id].approved += row.n;
      else if (st === 'rejected') byC[id].rejected += row.n;
      else byC[id].other += row.n;
    }
    const byL = {};
    for (const row of lps.rows || []) {
      const id = String(row.campaign_id);
      if (!byL[id]) byL[id] = { draft: 0, approved: 0, rejected: 0, other: 0 };
      const st = String(row.status || '').toLowerCase();
      if (st === 'draft') byL[id].draft += row.n;
      else if (st === 'approved') byL[id].approved += row.n;
      else if (st === 'rejected') byL[id].rejected += row.n;
      else byL[id].other += row.n;
    }
    return { ad_variants_by_campaign: byC, landing_variants_by_campaign: byL };
  } catch (e) {
    if (/does not exist/i.test(e.message || '')) {
      return empty;
    }
    console.warn('[growth-intelligence] variant summary skipped:', e.message);
    return empty;
  }
}

function resolveScoreRow(roiRow, statsByCampaignId, statsByUtm) {
  if (roiRow.campaign_id) {
    return statsByCampaignId.get(String(roiRow.campaign_id)) || null;
  }
  const u = normUtm(roiRow.utm_campaign);
  if (u) return statsByUtm.get(u) || statsByUtm.get(roiRow.utm_campaign) || null;
  return null;
}

function highScoreShare(scoreRow) {
  if (!scoreRow || !scoreRow.lead_count) return null;
  const scored = scoreRow.lead_count - num(scoreRow.unscored_leads);
  if (scored <= 0) return null;
  return num(scoreRow.high_score_leads) / scored;
}

/**
 * Core analysis: pure function for testability.
 * @param {{
 *   roiRows: object[],
 *   statsByCampaignId: Map,
 *   statsByUtm: Map,
 *   variantSummary: object,
 *   ga4: object,
 * }} ctx
 */
function analyzeGrowthContext(ctx) {
  const { roiRows, statsByCampaignId, statsByUtm, variantSummary, ga4 } = ctx;

  const insights = [];
  const recommendations = [];
  const warnings = [];

  if (!roiRows.length) {
    warnings.push({
      code: 'no_roi_data',
      message: 'No rows from v_campaign_roi_summary — run migrations or wait for attributed leads/costs.',
    });
  }

  if (!ga4.available) {
    insights.push({
      type: 'data_scope',
      message:
        'GA4 behaviour not connected; using lead scores + conversion_rate + revenue_per_lead as landing/traffic-quality proxies.',
    });
  }

  for (const row of roiRows) {
    const label = String(row.utm_campaign || row.campaign_id || 'campaign').slice(0, 120);
    const leads = num(row.leads);
    const revenue = num(row.revenue);
    const rpl = row.revenue_per_lead != null ? num(row.revenue_per_lead) : leads > 0 ? revenue / leads : 0;
    const cr = row.conversion_rate != null ? num(row.conversion_rate) : null;
    const profit = num(row.profit);
    const cost = num(row.cost);

    const scoreRow = resolveScoreRow(row, statsByCampaignId, statsByUtm);
    const hShare = highScoreShare(scoreRow);
    const avgScore = scoreRow && scoreRow.avg_score != null ? num(scoreRow.avg_score) : null;

    if (leads >= MIN_LEADS_FOR_CAMPAIGN_RULES && !row.campaign_id && cost === 0) {
      warnings.push({
        code: 'utm_only_no_cost',
        campaign_label: label,
        message:
          'UTM-only bucket: ad spend may not join this row — avoid budget decisions until leads use campaign_id or costs are mapped.',
      });
    }

    // R1 — Low quality traffic: many leads, weak economics (not “get more clicks”).
    if (
      leads >= HIGH_VOLUME_LEADS &&
      (revenue <= WEAK_TOTAL_REVENUE || (rpl > 0 && rpl < WEAK_REVENUE_PER_LEAD) || (rpl === 0 && revenue === 0))
    ) {
      insights.push({
        type: 'traffic_quality',
        campaign_id: row.campaign_id || null,
        utm_campaign: row.utm_campaign || null,
        message: `Campaign "${label}" shows high lead volume (${leads}) but weak revenue (${revenue}) / RPL (${rpl.toFixed(0)}) — pattern consistent with low-intent or job-shop demand, not advisory.`,
      });
      recommendations.push({
        type: 'targeting',
        reason:
          'Volume without advisory economics usually means keywords or audiences match repairs, “cheap electrician”, or urgent fixes — misaligned with risk/energy advisory.',
        action:
          'Tighten search terms and negatives; exclude emergency/repair intent where possible. Shift messaging toward independent assessment, bills, solar/battery decisions, and landlord compliance — explicitly not same-day small works.',
        priority: 'high',
        campaign_label: label,
      });
      recommendations.push({
        type: 'landing',
        reason: 'Landing may be qualifying poorly if high volume still yields weak RPL.',
        action:
          'Above the fold: clarify “independent advisory / report-led” and disqualify small repair and price-only enquiries. Add friction that filters price shoppers (scope, outcome, investment mindset) rather than a generic “get a quote”.',
        priority: 'high',
        campaign_label: label,
      });
      recommendations.push({
        type: 'ad_copy',
        reason: 'Creative may be over-broad and attracting the wrong jobs.',
        action:
          'Rewrite angles to repel low-value intent: state “not for urgent repairs” and “independent advisory — not a labour quote shop”. Lead with bill pain, solar/battery decision risk, or compliance clarity for investors.',
        priority: 'medium',
        campaign_label: label,
      });
    }

    // R2 — Proven quality + economics → careful budget scale (still not CTR goal).
    if (
      leads >= MIN_LEADS_FOR_CAMPAIGN_RULES &&
      cr != null &&
      cr >= STRONG_CONVERSION_RATE &&
      rpl >= STRONG_REVENUE_PER_LEAD &&
      profit >= 0
    ) {
      insights.push({
        type: 'scale_candidate',
        campaign_id: row.campaign_id || null,
        utm_campaign: row.utm_campaign || null,
        message: `Campaign "${label}" shows strong conversion (${(cr * 100).toFixed(1)}%) and revenue per lead (~$${rpl.toFixed(0)}) with non-negative profit — eligible to scale budget while monitoring lead quality.`,
      });
      recommendations.push({
        type: 'budget',
        reason:
          'Funnel already converts to wins and strong RPL; incremental spend is more likely to add high-quality advisory demand than blind traffic.',
        action:
          'Increase budget incrementally (e.g. 10–20% steps), watch high-score lead share and RPL weekly — roll back if low-score share rises.',
        priority: 'medium',
        campaign_label: label,
      });
    }

    // R3 — Many leads, few high scores: wrong audience.
    if (
      leads >= HIGH_VOLUME_LEADS &&
      hShare != null &&
      hShare < LOW_HIGH_SCORE_SHARE &&
      scoreRow &&
      num(scoreRow.lead_count) >= MIN_LEADS_FOR_CAMPAIGN_RULES
    ) {
      insights.push({
        type: 'audience_mismatch',
        campaign_id: row.campaign_id || null,
        utm_campaign: row.utm_campaign || null,
        message: `Campaign "${label}" drives volume but only ~${(hShare * 100).toFixed(0)}% of scored leads are high-intent (score ≥${HIGH_SCORE_THRESHOLD}) — ads likely attract the wrong customer type.`,
      });
      recommendations.push({
        type: 'ad_copy',
        reason:
          'Scoring mix suggests repair/price shoppers vs homeowners/investors facing energy or compliance decisions.',
        action:
          'Refine headlines/descriptions toward “independent electrical risk & energy advisory”, “avoid wrong solar/battery decisions”, “landlord compliance clarity”. Add explicit exclusions for emergency callouts and lowest-price shopping.',
        priority: 'high',
        campaign_label: label,
      });
      recommendations.push({
        type: 'targeting',
        reason: 'Placements or keywords may still capture handyman/repair intent.',
        action:
          'Review search terms report; add negatives for urgent repair language. Prefer in-market segments aligned with solar/energy upgrade research and property investment where relevant.',
        priority: 'high',
        campaign_label: label,
      });
    }

    // R4 — Landing proxy: weak conversion and weak scores with enough traffic.
    if (
      leads >= MIN_LEADS_FOR_CAMPAIGN_RULES &&
      cr != null &&
      cr < STRONG_CONVERSION_RATE * 0.5 &&
      avgScore != null &&
      avgScore < HIGH_SCORE_THRESHOLD - 5
    ) {
      insights.push({
        type: 'landing_proxy',
        campaign_id: row.campaign_id || null,
        utm_campaign: row.utm_campaign || null,
        message: `Campaign "${label}" combines below-target conversion (${(cr * 100).toFixed(1)}%) with mediocre average lead score (${avgScore.toFixed(0)}) — landing and/or ad promise may be attracting non-advisory enquiries.`,
      });
      recommendations.push({
        type: 'landing',
        reason:
          'Without GA4, low win rate + middling scores suggest the page does not filter low-value users or set correct expectations.',
        action:
          'Surface advisory scope, typical investment mindset, and deliverable (report / strategy). Reduce “fast cheap electrician” cues; add qualifying questions or copy that steers small repairs elsewhere.',
        priority: 'medium',
        campaign_label: label,
      });
    }

    // Variant hygiene (soft warning / insight)
    if (row.campaign_id) {
      const cid = String(row.campaign_id);
      const ads = variantSummary.ad_variants_by_campaign[cid];
      const lps = variantSummary.landing_variants_by_campaign[cid];
      if (ads && ads.draft > 4 && ads.approved < 2) {
        insights.push({
          type: 'variant_backlog',
          campaign_id: row.campaign_id,
          message: `Campaign "${label}" has ${ads.draft} draft ad variants but few approved — risk of churn without learning from live traffic.`,
        });
      }
      if (lps && lps.draft > 3 && lps.approved < 1) {
        recommendations.push({
          type: 'landing',
          reason: 'Approved landing variants scarce vs drafts — delays testing of disqualifying copy.',
          action: 'Prioritise review of landing variants that stress independence and advisory scope; approve one focused variant per page_key for controlled tests.',
          priority: 'low',
          campaign_label: label,
        });
      }
    }
  }

  // Global framing recommendation (always-on strategy reminder)
  recommendations.push({
    type: 'ad_copy',
    reason: 'Company strategy: maximise qualified advisory demand, not click or raw lead volume.',
    action: `${COMPANY_FRAME.positioning} ${COMPANY_FRAME.copy_principles.join(' ')}`,
    priority: 'low',
    campaign_label: '_global',
  });

  return {
    generated_at: new Date().toISOString(),
    frame: COMPANY_FRAME,
    insights,
    recommendations,
    warnings,
  };
}

/**
 * Load context from DB and run analysis.
 * @param {{ db?: import('pg').Pool }} [opts]
 */
async function getGrowthIntelligence(opts = {}) {
  const db = opts.db || pool;
  const [roiRows, statsByCampaignId, statsByUtm, variantSummary, ga4] = await Promise.all([
    fetchCampaignRoiRows(db),
    fetchLeadScoreStatsByCampaignId(db),
    fetchLeadScoreStatsByUtm(db),
    fetchVariantSummary(db),
    fetchGa4BehaviorContext(),
  ]);

  return analyzeGrowthContext({
    roiRows,
    statsByCampaignId,
    statsByUtm,
    variantSummary,
    ga4,
  });
}

/**
 * Deterministic examples for docs/tests (no DB).
 * Illustrates three common strategic situations.
 */
function getMockExampleOutputs() {
  return [
    {
      scenario: 'High volume, weak revenue — low quality traffic (R1)',
      output: analyzeGrowthContext({
        roiRows: [
          {
            campaign_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            utm_campaign: 'google_search_nonbrand',
            leads: 48,
            wins: 2,
            revenue: 1800,
            cost: 3200,
            profit: -1400,
            conversion_rate: 2 / 48,
            revenue_per_lead: 1800 / 48,
          },
        ],
        statsByCampaignId: new Map([
          [
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            {
              campaign_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
              lead_count: 48,
              avg_score: 38,
              high_score_leads: 4,
              low_score_leads: 31,
              unscored_leads: 0,
            },
          ],
        ]),
        statsByUtm: new Map(),
        variantSummary: { ad_variants_by_campaign: {}, landing_variants_by_campaign: {} },
        ga4: { available: false, sessionsByPageKey: {}, note: 'mock' },
      }),
    },
    {
      scenario: 'Strong conversion + RPL — scale candidate (R2)',
      output: analyzeGrowthContext({
        roiRows: [
          {
            campaign_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            utm_campaign: 'energy_advisory_search',
            leads: 22,
            wins: 5,
            revenue: 12000,
            cost: 2100,
            profit: 9900,
            conversion_rate: 5 / 22,
            revenue_per_lead: 12000 / 22,
          },
        ],
        statsByCampaignId: new Map([
          [
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            {
              campaign_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
              lead_count: 22,
              avg_score: 72,
              high_score_leads: 14,
              low_score_leads: 2,
              unscored_leads: 0,
            },
          ],
        ]),
        statsByUtm: new Map(),
        variantSummary: { ad_variants_by_campaign: {}, landing_variants_by_campaign: {} },
        ga4: { available: false, sessionsByPageKey: {}, note: 'mock' },
      }),
    },
    {
      scenario: 'Many leads, few high scores — wrong audience (R3) + UTM cost warning',
      output: analyzeGrowthContext({
        roiRows: [
          {
            campaign_id: null,
            utm_campaign: 'generic_electrician',
            leads: 60,
            wins: 1,
            revenue: 900,
            cost: 0,
            profit: 900,
            conversion_rate: 1 / 60,
            revenue_per_lead: 15,
          },
        ],
        statsByCampaignId: new Map(),
        statsByUtm: new Map([
          [
            'generic_electrician',
            {
              utm_campaign: 'generic_electrician',
              lead_count: 60,
              avg_score: 41,
              high_score_leads: 5,
              low_score_leads: 48,
              unscored_leads: 0,
            },
          ],
        ]),
        variantSummary: { ad_variants_by_campaign: {}, landing_variants_by_campaign: {} },
        ga4: { available: false, sessionsByPageKey: {}, note: 'mock' },
      }),
    },
  ];
}

module.exports = {
  getGrowthIntelligence,
  analyzeGrowthContext,
  fetchGa4BehaviorContext,
  fetchCampaignRoiRows,
  fetchLeadScoreStatsByCampaignId,
  fetchLeadScoreStatsByUtm,
  fetchVariantSummary,
  getMockExampleOutputs,
  COMPANY_FRAME,
  /** Exported for tests / tuning */
  THRESHOLDS: {
    MIN_LEADS_FOR_CAMPAIGN_RULES,
    HIGH_VOLUME_LEADS,
    HIGH_SCORE_THRESHOLD,
    LOW_SCORE_THRESHOLD,
    STRONG_CONVERSION_RATE,
    STRONG_REVENUE_PER_LEAD,
    WEAK_REVENUE_PER_LEAD,
    WEAK_TOTAL_REVENUE,
    LOW_HIGH_SCORE_SHARE,
  },
};
