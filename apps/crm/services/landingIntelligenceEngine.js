/**
 * Landing Intelligence Engine (v1) — analysis layer only.
 *
 * Combines GA4 behavior, CRM lead quality (scores), and campaign ROI (approximate by campaign/utm).
 * Does NOT: call OpenAI, touch Growth Intelligence Engine, publish pages, or optimise for raw clicks.
 *
 * Business frame: prefer fewer, better-fit advisory leads over volume; recommendations emphasise
 * filtering and qualification, not “raise conversion at any cost”.
 */

const { pool } = require('../lib/db');

/** Align with growthIntelligenceEngine — high-intent proxy. */
const HIGH_SCORE_THRESHOLD = 65;

/** Minimum sessions before session–funnel rules fire (noise guard). */
const MIN_SESSIONS_FOR_FUNNEL = 35;

/** “High traffic” for no-lead warning. */
const MIN_SESSIONS_NO_LEAD_WARN = 40;

/** form_start / sessions — below this with volume ⇒ top-of-funnel / CTA weakness. */
const LOW_FORM_START_RATE = 0.018;

/** Enough form starts to judge mid-funnel. */
const MIN_FORM_STARTS_MID_FUNNEL = 6;

/** form_submit / form_start — strong drop-off. */
const LOW_FORM_COMPLETION_RATE = 0.32;

/** GA4 engagementRate is typically 0–1. */
const LOW_ENGAGEMENT = 0.38;
const MID_ENGAGEMENT_LOW = 0.38;
const MID_ENGAGEMENT_HIGH = 0.58;

/** Avg lead score (0–100) — “wrong crowd” when engagement also weak. */
const LOW_AVG_LEAD_SCORE = 44;

/** Share of scored leads ≥ HIGH_SCORE_THRESHOLD — “page filters well”. */
const STRONG_HIGH_SCORE_RATIO = 0.34;

/** ROI hint: weak economics with volume (tune per business). */
const WEAK_REVENUE_PER_LEAD = 130;

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normUtm(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

function round4(x) {
  return Math.round(x * 10000) / 10000;
}

/**
 * @param {import('pg').Pool} db
 * @param {number} days
 */
async function fetchGa4PageAggregates(db, days) {
  try {
    const r = await db.query(
      `SELECT
         page_path,
         SUM(sessions)::bigint AS sessions,
         SUM(total_users)::bigint AS total_users,
         SUM(views)::bigint AS views,
         CASE WHEN SUM(sessions) > 0 THEN
           SUM(COALESCE(engagement_rate, 0) * sessions::numeric) / NULLIF(SUM(sessions)::numeric, 0)
         END AS engagement_rate,
         CASE WHEN SUM(sessions) > 0 THEN
           SUM(COALESCE(average_session_duration, 0) * sessions::numeric) / NULLIF(SUM(sessions)::numeric, 0)
         END AS average_session_duration,
         CASE WHEN SUM(sessions) > 0 THEN
           SUM(COALESCE(bounce_rate, 0) * sessions::numeric) / NULLIF(SUM(sessions)::numeric, 0)
         END AS bounce_rate
       FROM ga4_page_metrics_daily
       WHERE date >= (CURRENT_DATE - ($1::int * INTERVAL '1 day'))
       GROUP BY page_path`,
      [days]
    );
    const map = new Map();
    for (const row of r.rows || []) {
      map.set(row.page_path, row);
    }
    return { map, available: true };
  } catch (e) {
    if (/does not exist|relation/i.test(e.message || '')) {
      console.warn('[landing-intelligence] ga4_page_metrics_daily missing:', e.message);
      return { map: new Map(), available: false };
    }
    throw e;
  }
}

/**
 * @param {import('pg').Pool} db
 * @param {number} days
 */
async function fetchGa4EventAggregates(db, days) {
  try {
    const r = await db.query(
      `SELECT page_path, event_name, SUM(event_count)::bigint AS event_count
       FROM ga4_event_metrics_daily
       WHERE date >= (CURRENT_DATE - ($1::int * INTERVAL '1 day'))
         AND event_name = ANY($2::text[])
       GROUP BY page_path, event_name`,
      [days, ['form_start', 'form_submit', 'click_cta']]
    );
    /** @type {Map<string, { form_start: number, form_submit: number, click_cta: number }>} */
    const map = new Map();
    for (const row of r.rows || []) {
      const p = row.page_path || '';
      if (!map.has(p)) {
        map.set(p, { form_start: 0, form_submit: 0, click_cta: 0 });
      }
      const cur = map.get(p);
      const c = num(row.event_count);
      if (row.event_name === 'form_start') cur.form_start += c;
      if (row.event_name === 'form_submit') cur.form_submit += c;
      if (row.event_name === 'click_cta') cur.click_cta += c;
    }
    return { map, available: true };
  } catch (e) {
    if (/does not exist|relation/i.test(e.message || '')) {
      console.warn('[landing-intelligence] ga4_event_metrics_daily missing:', e.message);
      return { map: new Map(), available: false };
    }
    throw e;
  }
}

/**
 * @param {import('pg').Pool} db
 * @param {number} days
 */
async function fetchLeadRowsForLanding(db, days) {
  try {
    const r = await db.query(
      `SELECT
         CASE
           WHEN l.landing_page_url IS NULL OR TRIM(l.landing_page_url) = '' THEN NULL
           WHEN l.landing_page_url ~* '^https?://' THEN
             COALESCE((regexp_match(l.landing_page_url, '^https?://[^/]+(/[^?#]*)'))[1], '/')
           WHEN l.landing_page_url LIKE '/%' THEN split_part(l.landing_page_url, '?', 1)
           ELSE NULL
         END AS page_path,
         l.campaign_id,
         NULLIF(TRIM(l.utm_campaign), '') AS utm_campaign,
         vls.score AS lead_score
       FROM leads l
       LEFT JOIN v_latest_lead_scores vls ON vls.lead_id = l.id
       WHERE l.created_at >= NOW() - ($1::int * INTERVAL '1 day')`,
      [days]
    );
    return { rows: r.rows || [], available: true };
  } catch (e) {
    if (/does not exist|landing_page_url|v_latest_lead_scores/i.test(e.message || '')) {
      console.warn('[landing-intelligence] lead landing / scores query skipped:', e.message);
      return { rows: [], available: false };
    }
    throw e;
  }
}

/**
 * @param {import('pg').Pool} db
 */
async function fetchRoiSummaryIndexed(db) {
  try {
    const r = await db.query(`SELECT * FROM v_campaign_roi_summary`);
    const byCampaignId = new Map();
    const byUtm = new Map();
    for (const row of r.rows || []) {
      if (row.campaign_id) {
        byCampaignId.set(String(row.campaign_id), row);
      }
      const u = normUtm(row.utm_campaign);
      if (u && !byUtm.has(u)) {
        byUtm.set(u, row);
      }
    }
    return { byCampaignId, byUtm, available: true };
  } catch (e) {
    if (/does not exist/i.test(e.message || '')) {
      console.warn('[landing-intelligence] v_campaign_roi_summary missing:', e.message);
      return { byCampaignId: new Map(), byUtm: new Map(), available: false };
    }
    throw e;
  }
}

/**
 * Roll up lead rows into per-page stats + dominant campaign / utm for ROI join.
 * @param {Array<{ page_path: string|null, campaign_id: string|null, utm_campaign: string|null, lead_score: number|null }>} rows
 */
function aggregateLeadsByPage(rows) {
  /** @type {Map<string, { lead_count: number, scored: number, high: number, sum_score: number, campaign_hist: Map<string, number>, utm_hist: Map<string, number> }>} */
  const m = new Map();
  for (const row of rows) {
    const path = row.page_path;
    if (!path || path === '') continue;
    if (!m.has(path)) {
      m.set(path, {
        lead_count: 0,
        scored: 0,
        high: 0,
        sum_score: 0,
        campaign_hist: new Map(),
        utm_hist: new Map(),
      });
    }
    const a = m.get(path);
    a.lead_count += 1;
    if (row.lead_score != null && Number.isFinite(Number(row.lead_score))) {
      a.scored += 1;
      const sc = num(row.lead_score);
      a.sum_score += sc;
      if (sc >= HIGH_SCORE_THRESHOLD) a.high += 1;
    }
    if (row.campaign_id) {
      const k = String(row.campaign_id);
      a.campaign_hist.set(k, (a.campaign_hist.get(k) || 0) + 1);
    }
    if (row.utm_campaign) {
      const u = String(row.utm_campaign).trim();
      if (u) {
        a.utm_hist.set(u, (a.utm_hist.get(u) || 0) + 1);
      }
    }
  }
  const out = new Map();
  for (const [path, a] of m) {
    const avg_lead_score = a.scored > 0 ? a.sum_score / a.scored : null;
    const high_score_ratio = a.scored > 0 ? a.high / a.scored : null;
    let topCampaign = null;
    let topCampaignCount = 0;
    for (const [cid, c] of a.campaign_hist) {
      if (c > topCampaignCount) {
        topCampaignCount = c;
        topCampaign = cid;
      }
    }
    let topUtm = null;
    let topUtmCount = 0;
    for (const [u, c] of a.utm_hist) {
      if (c > topUtmCount) {
        topUtmCount = c;
        topUtm = u;
      }
    }
    out.set(path, {
      lead_count: a.lead_count,
      avg_lead_score,
      high_score_ratio,
      topCampaign,
      topCampaignCount,
      topUtm,
      topUtmCount,
      campaign_hist: a.campaign_hist,
      utm_hist: a.utm_hist,
    });
  }
  return out;
}

/**
 * Attach ROI row + warnings when campaign attribution is ambiguous.
 */
function resolveRoiForPage(pagePath, leadAgg, roiIdx) {
  const warnings = [];
  if (!leadAgg || !roiIdx.available) {
    return { roi: null, campaign_link_warnings: warnings };
  }
  const { topCampaign, topCampaignCount, topUtm, topUtmCount, campaign_hist, utm_hist, lead_count } =
    leadAgg;

  if (lead_count === 0) {
    return { roi: null, campaign_link_warnings: warnings };
  }

  const campaignShares = [...campaign_hist.values()].map((c) => c / lead_count).filter((x) => x >= 0.15);
  if (campaign_hist.size >= 2 && campaignShares.length >= 2) {
    warnings.push(
      `roi_campaign_approximate: Multiple campaigns (${campaign_hist.size}) map to page_path "${pagePath}"; ROI row uses the dominant campaign_id only. Align utm_campaign / campaign_id on forms for cleaner attribution.`
    );
  }

  const utmShares = [...utm_hist.values()].map((c) => c / lead_count).filter((x) => x >= 0.15);
  if (!topCampaign && utm_hist.size >= 2 && utmShares.length >= 2) {
    warnings.push(
      `roi_utm_approximate: Multiple utm_campaign values on "${pagePath}"; cost data in v_campaign_roi_summary may not attach to utm-only buckets as reliably as campaign_id-bound leads.`
    );
  }

  let row = null;
  let source = null;
  if (topCampaign && roiIdx.byCampaignId.has(topCampaign)) {
    row = roiIdx.byCampaignId.get(topCampaign);
    source = 'campaign_id';
  } else if (topUtm) {
    const hit = roiIdx.byUtm.get(normUtm(topUtm));
    if (hit) {
      row = hit;
      source = 'utm_campaign';
      if (!topCampaign) {
        warnings.push(
          `roi_utm_only_match: Page "${pagePath}" ROI joined via utm_campaign ("${topUtm}"); spend/cost in summary applies only when leads use campaigns.id matching campaign_costs — see schema comments in 034.`
        );
      }
    }
  }

  if (!row && (topCampaign || topUtm)) {
    warnings.push(
      `roi_no_row: No matching v_campaign_roi_summary row for dominant attribution on "${pagePath}" (campaign_id=${topCampaign || 'null'}, utm=${topUtm || 'null'}).`
    );
  }

  const roi = row
    ? {
        campaign_id: row.campaign_id,
        utm_campaign: row.utm_campaign,
        leads: num(row.leads),
        revenue: row.revenue != null ? num(row.revenue) : null,
        profit: row.profit != null ? num(row.profit) : null,
        revenue_per_lead: row.revenue_per_lead != null ? num(row.revenue_per_lead) : null,
        conversion_rate: row.conversion_rate != null ? num(row.conversion_rate) : null,
        _joined_via: source,
      }
    : null;

  return { roi, campaign_link_warnings: warnings };
}

/**
 * Pure analysis for one page (testable, no I/O).
 *
 * @param {{
 *   page_path: string;
 *   metrics: {
 *     sessions: number;
 *     views: number;
 *     total_users: number;
 *     form_start: number;
 *     form_submit: number;
 *     click_cta: number;
 *     engagement_rate: number | null;
 *     average_session_duration: number | null;
 *     bounce_rate: number | null;
 *     avg_lead_score: number | null;
 *     high_score_ratio: number | null;
 *     lead_count: number;
 *   };
 *   roi?: object | null;
 *   flags?: { ga4_available?: boolean };
 *   campaign_link_warnings?: string[];
 * }} ctx
 * @returns {{ insights: Array<{ type: string, message: string }>, recommendations: Array<{ type: string, reason: string, action: string, priority: string }>, warnings: string[] }}
 */
function analyzeLandingContext(ctx) {
  const { page_path, metrics, roi, flags } = ctx;
  const ga4Ok = flags?.ga4_available !== false;

  const insights = [];
  const recommendations = [];
  /** @type {string[]} */
  const warnings = [...(ctx.campaign_link_warnings || [])];

  const s = num(metrics.sessions);
  const fs = num(metrics.form_start);
  const fsub = num(metrics.form_submit);
  const er = metrics.engagement_rate != null ? num(metrics.engagement_rate) : null;
  const dur = metrics.average_session_duration != null ? num(metrics.average_session_duration) : null;
  const als = metrics.avg_lead_score != null ? num(metrics.avg_lead_score) : null;
  const hsr = metrics.high_score_ratio != null ? num(metrics.high_score_ratio) : null;
  const lc = num(metrics.lead_count);

  const formStartRate = s > 0 ? fs / s : 0;
  const formCompleteRate = fs > 0 ? fsub / fs : 0;

  /* Rule 5 — traffic without CRM leads */
  if (ga4Ok && s >= MIN_SESSIONS_NO_LEAD_WARN && lc === 0) {
    warnings.push(
      `no_leads_for_page: GA4 reports substantial sessions (${s}) but no CRM leads with landing_page_url matching this page_path in the window. Check URL capture, path normalisation vs GA4, or tracking gaps.`
    );
  }

  /* Rule 1 — high sessions, very low form_start */
  if (ga4Ok && s >= MIN_SESSIONS_FOR_FUNNEL && formStartRate < LOW_FORM_START_RATE) {
    insights.push({
      type: 'weak_intent_capture',
      message:
        'Sessions are healthy but almost no form_start events — visitors are not being pulled into qualification. Likely weak hero value proposition or invisible / low-commitment CTA, not a “need more traffic” problem.',
    });
    recommendations.push({
      type: 'cta',
      reason:
        'Top-of-funnel signal is cold: quality strategy should make the right visitors self-select into the form, not chase everyone to click.',
      action:
        'Strengthen primary CTA clarity and above-the-fold framing (who this is for / not for) so advisory-fit visitors recognise themselves before scrolling.',
      priority: s >= MIN_SESSIONS_NO_LEAD_WARN ? 'high' : 'medium',
    });
    recommendations.push({
      type: 'hero',
      reason:
        'Hero and headline set the filter; without them, high session volume often means unqualified scrollers.',
      action:
        'Tighten headline and subhead to disqualify repair / price-shopping traffic and spell advisory scope explicitly.',
      priority: 'medium',
    });
  }

  /* Rule 2 — form_start high, form_submit low */
  if (ga4Ok && fs >= MIN_FORM_STARTS_MID_FUNNEL && formCompleteRate < LOW_FORM_COMPLETION_RATE) {
    const trustLean = er != null && er < 0.45;
    insights.push({
      type: 'mid_funnel_drop',
      message:
        'Many users start the form but few submit — often friction, excessive fields, or missing trust signals. Optimise for honest completion by right-fit leads, not brute-force conversion.',
    });
    recommendations.push({
      type: trustLean ? 'trust' : 'form',
      reason: trustLean
        ? 'Engagement is mediocre — drop-off may reflect uncertainty about independence, scope, or outcomes.'
        : 'Completion rate suggests process weight or unclear “why we ask this” copy.',
      action: trustLean
        ? 'Add proof points (independence, methodology, who you do not serve) near the form; avoid generic social proof that attracts low-fit jobs.'
        : 'Reduce steps/fields where possible; explain how each field improves advisory fit; consider progressive profiling for lower-intent paths.',
      priority: 'high',
    });
    if (!trustLean) {
      recommendations.push({
        type: 'trust',
        reason: 'Even with tolerable engagement, advisory leads often stall without credibility context.',
        action: 'Pair form changes with short trust strip (credentials, process, typical client) tuned for high-bill / strategy buyers.',
        priority: 'medium',
      });
    }
  }

  /* Rule 3 — low engagement + low lead quality */
  if (er != null && er < LOW_ENGAGEMENT && als != null && als < LOW_AVG_LEAD_SCORE && lc >= 5) {
    insights.push({
      type: 'wrong_audience_signal',
      message:
        'Shallow engagement and weak lead scores together suggest the page is attracting low-fit demand (e.g. quick repair / price shopping). Prioritise sharper qualification over “more engaging” gimmicks.',
    });
    recommendations.push({
      type: 'qualification',
      reason:
        'Volume without fit damages economics; the goal is to repel tyre-kickers and attract bill/compliance/solar-advisory conversations.',
      action:
        'Rewrite above-the-fold copy to explicitly exclude small jobs and cheapest-quote seekers; add qualifying questions or copy that raises the bar before form_start.',
      priority: 'high',
    });
  }

  /* Rule 4 — medium engagement + strong high-score share */
  if (
    er != null &&
    er >= MID_ENGAGEMENT_LOW &&
    er <= MID_ENGAGEMENT_HIGH &&
    hsr != null &&
    hsr >= STRONG_HIGH_SCORE_RATIO &&
    lc >= 6
  ) {
    insights.push({
      type: 'healthy_filter',
      message:
        'Engagement is moderate but a large share of leads score highly — the page is likely filtering the audience well. Favour surgical CTA and form tweaks over repositioning the whole offer.',
    });
    recommendations.push({
      type: 'cta',
      reason:
        'Audience quality is good; incremental gains should protect selectivity while making the next step obvious for qualified readers.',
      action:
        'Test CTA label, placement, and secondary friction (e.g. calendar vs form) without broadening messaging to chase marginal clicks.',
      priority: 'medium',
    });
  }

  /* ROI cross-check — weak revenue per lead with volume (approximate campaign) */
  if (
    roi &&
    roi.revenue_per_lead != null &&
    roi.revenue_per_lead < WEAK_REVENUE_PER_LEAD &&
    num(roi.leads) >= 10 &&
    lc >= 5
  ) {
    insights.push({
      type: 'weak_economics',
      message:
        `Attached campaign bucket shows revenue_per_lead ≈ ${round4(roi.revenue_per_lead)} — with lead volume, economics may be diluted. Treat as a qualification problem before scaling traffic.`,
    });
    recommendations.push({
      type: 'qualification',
      reason:
        'Low revenue per lead combined with CRM activity suggests traffic or messaging is widening the funnel beyond advisory-fit wins.',
      action:
        'Tighten ICP language and form gating; align sales follow-up to drop persistent low-score paths rather than optimising for submit rate alone.',
      priority: 'medium',
    });
  }

  /* Low CTA clicks vs sessions (secondary) */
  if (ga4Ok && s >= MIN_SESSIONS_FOR_FUNNEL && num(metrics.click_cta) / s < 0.012 && fs < LOW_FORM_START_RATE * s) {
    if (!recommendations.some((r) => r.type === 'cta')) {
      recommendations.push({
        type: 'cta',
        reason: 'CTA clicks are sparse relative to sessions; primary action may be buried or misaligned with visitor intent.',
        action: 'Surface one dominant action per viewport; align wording with advisory outcomes, not generic “contact us”.',
        priority: 'low',
      });
    }
  }

  return { insights, recommendations, warnings };
}

/**
 * @param {{ db?: import('pg').Pool, days?: number }} opts
 * @returns {Promise<{ pages: Array<{ page_path: string, metrics: object, insights: object[], recommendations: object[], warnings: string[] }> }>}
 */
async function getLandingIntelligence(opts = {}) {
  const db = opts.db || pool;
  const days = Number.isFinite(Number(opts.days)) && Number(opts.days) > 0 ? Math.floor(Number(opts.days)) : 14;

  const [ga4Page, ga4Events, leadFetch, roiIdx] = await Promise.all([
    fetchGa4PageAggregates(db, days),
    fetchGa4EventAggregates(db, days),
    fetchLeadRowsForLanding(db, days),
    fetchRoiSummaryIndexed(db),
  ]);

  const ga4_available = ga4Page.available && ga4Events.available;
  const leadByPage = aggregateLeadsByPage(leadFetch.rows);

  const paths = new Set();
  for (const p of ga4Page.map.keys()) {
    if (p) paths.add(p);
  }
  for (const p of ga4Events.map.keys()) {
    if (p) paths.add(p);
  }
  for (const p of leadByPage.keys()) {
    if (p) paths.add(p);
  }

  const pages = [];

  for (const page_path of [...paths].sort((a, b) => a.localeCompare(b))) {
    const g = ga4Page.map.get(page_path) || {};
    const ev = ga4Events.map.get(page_path) || { form_start: 0, form_submit: 0, click_cta: 0 };
    const la = leadByPage.get(page_path);

    const sessions = num(g.sessions);
    const metrics = {
      sessions,
      total_users: num(g.total_users),
      views: num(g.views),
      form_start: ev.form_start,
      form_submit: ev.form_submit,
      click_cta: ev.click_cta,
      engagement_rate: g.engagement_rate != null ? num(g.engagement_rate) : null,
      average_session_duration: g.average_session_duration != null ? num(g.average_session_duration) : null,
      bounce_rate: g.bounce_rate != null ? num(g.bounce_rate) : null,
      avg_lead_score: la?.avg_lead_score ?? null,
      high_score_ratio: la?.high_score_ratio ?? null,
      lead_count: la?.lead_count ?? 0,
    };

    const { roi, campaign_link_warnings } = resolveRoiForPage(page_path, la, roiIdx);

    const analyzed = analyzeLandingContext({
      page_path,
      metrics,
      roi,
      flags: { ga4_available },
      campaign_link_warnings,
    });

    pages.push({
      page_path,
      metrics,
      insights: analyzed.insights,
      recommendations: analyzed.recommendations,
      warnings: analyzed.warnings,
    });
  }

  return { pages };
}

/**
 * Static mock outputs for docs/tests — not live data.
 */
const LANDING_INTELLIGENCE_MOCK_EXAMPLES = [
  {
    label: 'High traffic, cold top-of-funnel (CTA / hero)',
    output: {
      page_path: '/energy',
      metrics: {
        sessions: 4200,
        total_users: 3100,
        views: 8900,
        form_start: 28,
        form_submit: 6,
        click_cta: 35,
        engagement_rate: 0.52,
        average_session_duration: 42.3,
        bounce_rate: 0.41,
        avg_lead_score: 58,
        high_score_ratio: 0.22,
        lead_count: 12,
      },
      insights: [
        {
          type: 'weak_intent_capture',
          message:
            'Sessions are healthy but almost no form_start events — visitors are not being pulled into qualification.',
        },
      ],
      recommendations: [
        {
          type: 'cta',
          reason: 'Top-of-funnel signal is cold; prioritise self-selection over volume.',
          action: 'Strengthen primary CTA and above-the-fold framing for advisory-fit visitors.',
          priority: 'high',
        },
        {
          type: 'hero',
          reason: 'Headline sets the filter for quality.',
          action: 'Disqualify repair / price-shopping traffic explicitly in hero copy.',
          priority: 'medium',
        },
      ],
      warnings: [],
    },
  },
  {
    label: 'Form abandonment + trust gap',
    output: {
      page_path: '/solar-advisory',
      metrics: {
        sessions: 890,
        total_users: 620,
        views: 1500,
        form_start: 95,
        form_submit: 18,
        click_cta: 120,
        engagement_rate: 0.41,
        average_session_duration: 55,
        bounce_rate: 0.38,
        avg_lead_score: 61,
        high_score_ratio: 0.31,
        lead_count: 22,
      },
      insights: [
        {
          type: 'mid_funnel_drop',
          message: 'Many users start the form but few submit — friction or trust, not necessarily “bad traffic”.',
        },
      ],
      recommendations: [
        {
          type: 'trust',
          reason: 'Engagement is mediocre; uncertainty may block right-fit leads.',
          action: 'Add independence, scope, and “who we do not serve” near the form.',
          priority: 'high',
        },
      ],
      warnings: [],
    },
  },
  {
    label: 'Wrong crowd + no CRM match warning',
    output: {
      page_path: '/cheap-sparky',
      metrics: {
        sessions: 2100,
        total_users: 1800,
        views: 4100,
        form_start: 120,
        form_submit: 40,
        click_cta: 200,
        engagement_rate: 0.28,
        average_session_duration: 22,
        bounce_rate: 0.62,
        avg_lead_score: 36,
        high_score_ratio: 0.09,
        lead_count: 18,
      },
      insights: [
        {
          type: 'wrong_audience_signal',
          message: 'Shallow engagement and weak scores — likely attracting low-fit demand; sharpen filters.',
        },
      ],
      recommendations: [
        {
          type: 'qualification',
          reason: 'Economics suffer when the funnel widens beyond advisory-fit.',
          action: 'Exclude small-job / cheapest-quote positioning; raise bar before form_start.',
          priority: 'high',
        },
      ],
      warnings: [
        'roi_campaign_approximate: Multiple campaigns (2) map to page_path "/cheap-sparky"; ROI row uses the dominant campaign_id only.',
      ],
    },
  },
];

module.exports = {
  getLandingIntelligence,
  analyzeLandingContext,
  LANDING_INTELLIGENCE_MOCK_EXAMPLES,
  HIGH_SCORE_THRESHOLD,
};
