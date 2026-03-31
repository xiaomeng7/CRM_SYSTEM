/**
 * Campaign ROI AI insights from v_campaign_roi_summary.
 * Uses OpenAI when OPENAI_API_KEY is set; otherwise rule-based fallback.
 */

const { pool } = require('../lib/db');

const MODEL = 'gpt-4o-mini';

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  const OpenAI = require('openai');
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function serializeRows(rows) {
  return rows.map((r) => ({
    campaign_id: r.campaign_id,
    utm_campaign: r.utm_campaign,
    leads: r.leads != null ? Number(r.leads) : 0,
    wins: r.wins != null ? Number(r.wins) : 0,
    revenue: r.revenue != null ? Number(r.revenue) : 0,
    cost: r.cost != null ? Number(r.cost) : 0,
    profit: r.profit != null ? Number(r.profit) : 0,
    conversion_rate: r.conversion_rate != null ? Number(r.conversion_rate) : null,
    revenue_per_lead: r.revenue_per_lead != null ? Number(r.revenue_per_lead) : null,
    avg_revenue_per_win: r.avg_revenue_per_win != null ? Number(r.avg_revenue_per_win) : null,
  }));
}

async function fetchCampaignRoiRows() {
  const r = await pool.query(`SELECT * FROM v_campaign_roi_summary ORDER BY revenue DESC NULLS LAST`);
  return r.rows;
}

const SYSTEM_PROMPT = `You are a business analyst for a home services company.

You are given campaign performance data.

Your job is to:
1. Identify which campaigns are performing well
2. Identify which campaigns are underperforming
3. Recommend clear actions

Metrics provided per campaign:
- leads
- wins
- revenue
- cost
- profit
- conversion_rate
- revenue_per_lead

Rules:
- Focus on profitability and efficiency
- Be practical (this is a small business, not enterprise)
- Do NOT give generic advice

Actions you can suggest (use exact string in the "action" field):
- increase_budget
- decrease_budget
- pause_campaign
- improve_landing_page
- improve_ad_copy
- investigate_quality

Return JSON only with this shape (no markdown):
{
  "summary": "string",
  "insights": [
    {
      "campaign": "string (use utm_campaign or identifiable label)",
      "diagnosis": "string",
      "action": "one of the allowed actions above",
      "reason": "string"
    }
  ]
}`;

async function buildInsightsWithOpenAI(rows) {
  const client = getOpenAIClient();
  if (!client) throw new Error('no_openai');
  const payload = serializeRows(rows);
  const userContent = `Data:\n${JSON.stringify(payload)}`;

  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.35,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
  });

  const raw = completion.choices[0]?.message?.content || '{}';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    throw new Error('invalid_ai_json');
  }
  const summary = typeof parsed.summary === 'string' ? parsed.summary : '';
  const insights = Array.isArray(parsed.insights) ? parsed.insights : [];
  const normalized = insights
    .filter((x) => x && typeof x === 'object')
    .map((x) => ({
      campaign: String(x.campaign || x.utm_campaign || '').trim() || '(unknown)',
      diagnosis: String(x.diagnosis || '').trim(),
      action: String(x.action || '').trim(),
      reason: String(x.reason || '').trim(),
    }));
  return { summary, insights: normalized };
}

const ALLOWED_ACTIONS = new Set([
  'increase_budget',
  'decrease_budget',
  'pause_campaign',
  'improve_landing_page',
  'improve_ad_copy',
  'investigate_quality',
]);

function label(row) {
  return String(row.utm_campaign || row.campaign_id || 'campaign').trim();
}

/**
 * Rule-based insights when OpenAI is unavailable.
 */
function buildInsightsFallback(rows) {
  const data = serializeRows(rows);
  if (data.length === 0) {
    return {
      summary: 'No campaign rows in v_campaign_roi_summary yet. Add leads with campaign_id and costs to see insights.',
      insights: [],
    };
  }

  const withSpend = data.filter((r) => r.cost > 0);
  const profitable = data.filter((r) => r.profit > 0);
  const losing = data.filter((r) => r.cost > 0 && r.profit < 0);
  const convs = data
    .map((r) => r.conversion_rate)
    .filter((c) => c != null && !Number.isNaN(c))
    .sort((a, b) => a - b);
  const medianConv = convs.length ? convs[Math.floor(convs.length / 2)] : null;

  const insights = [];

  for (const r of data) {
    const name = label(r);
    const cr = r.conversion_rate;
    const leads = r.leads;

    if (r.cost > 0 && r.profit < -1) {
      insights.push({
        campaign: name,
        diagnosis: `Spending $${r.cost.toFixed(0)} but profit is negative ($${r.profit.toFixed(0)}).`,
        action: 'pause_campaign',
        reason: 'Stop losses until attribution and funnel are verified.',
      });
    } else if (r.cost > 0 && r.profit < 0) {
      insights.push({
        campaign: name,
        diagnosis: `Margin negative after ad cost (profit ${r.profit.toFixed(0)}).`,
        action: 'decrease_budget',
        reason: 'Reduce spend or fix conversion before scaling.',
      });
    } else if (leads >= 8 && cr != null && cr < 0.03) {
      insights.push({
        campaign: name,
        diagnosis: `Low win rate from traffic (${(cr * 100).toFixed(1)}% conv) with ${leads} leads.`,
        action: 'improve_landing_page',
        reason: 'Volume is there; qualification or offer on the page may be off.',
      });
    } else if (leads >= 5 && cr != null && medianConv != null && cr < medianConv * 0.4) {
      insights.push({
        campaign: name,
        diagnosis: 'Conversion well below typical campaigns in this dataset.',
        action: 'investigate_quality',
        reason: 'Check lead source quality, geo, and match type vs intent.',
      });
    } else if (r.revenue > 0 && r.wins >= 1 && r.revenue_per_lead != null && r.revenue_per_lead < 50 && leads >= 5) {
      insights.push({
        campaign: name,
        diagnosis: 'Revenue per lead is thin relative to home services ticket size.',
        action: 'improve_ad_copy',
        reason: 'Messaging may be attracting small jobs; tighten audience or value prop.',
      });
    } else if (r.cost > 0 && r.profit > 0 && cr != null && cr >= 0.08 && leads >= 3) {
      insights.push({
        campaign: name,
        diagnosis: 'Strong conversion and positive profit on current spend.',
        action: 'increase_budget',
        reason: 'Efficient funnel; modest scale-up is justified if ops can handle volume.',
      });
    }
  }

  const winners = profitable.length;
  const spenders = withSpend.length;
  const summaryParts = [
    `Analysed ${data.length} campaign bucket(s): ${winners} with positive profit, ${spenders} with ad cost recorded.`,
  ];
  if (losing.length) summaryParts.push(`${losing.length} campaign(s) are underwater on recorded spend — review first.`);
  if (insights.length === 0) {
    summaryParts.push('No strong rule-based flags; add more data or use AI when API key is configured.');
  }

  return {
    summary: summaryParts.join(' '),
    insights: insights.slice(0, 12),
  };
}

function normalizeAiActions(result) {
  const insights = result.insights.map((x) => {
    const a = x.action.toLowerCase().replace(/\s+/g, '_');
    const action = ALLOWED_ACTIONS.has(a) ? a : 'investigate_quality';
    return { ...x, action };
  });
  return { ...result, insights };
}

/**
 * @returns {Promise<{ summary: string, insights: Array, source: 'openai'|'fallback' }>}
 */
async function getCampaignRoiInsights() {
  const rows = await fetchCampaignRoiRows();
  if (process.env.OPENAI_API_KEY) {
    try {
      const ai = await buildInsightsWithOpenAI(rows);
      return { ...normalizeAiActions(ai), source: 'openai' };
    } catch (e) {
      console.warn('[campaign-roi-insights] OpenAI failed, using fallback:', e.message || e);
    }
  }
  const fb = buildInsightsFallback(rows);
  return { ...fb, source: 'fallback' };
}

module.exports = {
  getCampaignRoiInsights,
  fetchCampaignRoiRows,
  buildInsightsFallback,
  buildInsightsWithOpenAI,
};
