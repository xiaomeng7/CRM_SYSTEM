/**
 * Campaign Action Plan Engine — suggests safe, non-executing plans from ROI data + insights.
 * Does not call ad platforms or automation executors.
 */

const { pool } = require('../lib/db');
const { getCampaignRoiInsights, fetchCampaignRoiRows } = require('./campaignRoiInsights');

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MIN_LEADS = 10;
const COOLDOWN_DAYS = 3;
const MAX_PCT = 30;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  const OpenAI = require('openai');
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

/** Stable key for cooldown + matching (aligned with v_campaign_roi_summary buckets). */
function campaignKey(row) {
  if (row.campaign_id) return `id:${row.campaign_id}`;
  const u = String(row.utm_campaign || '').trim();
  if (u) return `utm:${u}`;
  return 'unattributed';
}

function displayCampaign(row) {
  return String(row.utm_campaign || row.campaign_id || 'campaign').trim();
}

/** Snapshot for UI / approval / review (from v_campaign_roi_summary row). */
function metricsFromRow(row) {
  return {
    leads: Number(row.leads || 0),
    wins: Number(row.wins || 0),
    revenue: Number(row.revenue || 0),
    cost: Number(row.cost || 0),
    profit: Number(row.profit || 0),
    conversion_rate: row.conversion_rate != null ? Number(row.conversion_rate) : null,
  };
}

async function fetchRecentExecutionKeys() {
  try {
    const r = await pool.query(
      `SELECT DISTINCT campaign_key
       FROM campaign_action_plan_executions
       WHERE COALESCE(reviewed_at, recorded_at) >= NOW() - INTERVAL '1 day' * $1
         AND status = 'executed'`,
      [COOLDOWN_DAYS]
    );
    return new Set(r.rows.map((x) => x.campaign_key));
  } catch (e) {
    if (/relation \"campaign_action_plan_executions\" does not exist/i.test(e.message || '')) {
      console.warn('[campaign-action-plans] executions table missing; run migration 035');
      return new Set();
    }
    if (/column .*status.*does not exist/i.test(e.message || '')) {
      const r2 = await pool.query(
        `SELECT DISTINCT campaign_key
         FROM campaign_action_plan_executions
         WHERE recorded_at >= NOW() - INTERVAL '1 day' * $1`,
        [COOLDOWN_DAYS]
      );
      return new Set(r2.rows.map((x) => x.campaign_key));
    }
    throw e;
  }
}

/**
 * Eligible rows: leads >= MIN_LEADS and not in 3-day execution cooldown.
 */
async function getEligibleCampaignContext() {
  const rows = await fetchCampaignRoiRows();
  const blocked = await fetchRecentExecutionKeys();
  const eligible = rows.filter((row) => {
    const leads = Number(row.leads || 0);
    if (leads < MIN_LEADS) return false;
    const key = campaignKey(row);
    if (blocked.has(key)) return false;
    return true;
  });
  return { allRows: rows, eligible, blockedKeys: blocked };
}

function serializeForPlanner(rows) {
  return rows.map((r) => ({
    campaign_key: campaignKey(r),
    utm_campaign: displayCampaign(r),
    leads: Number(r.leads || 0),
    wins: Number(r.wins || 0),
    revenue: Number(r.revenue || 0),
    cost: Number(r.cost || 0),
    profit: Number(r.profit || 0),
    conversion_rate: r.conversion_rate != null ? Number(r.conversion_rate) : null,
    revenue_per_lead: r.revenue_per_lead != null ? Number(r.revenue_per_lead) : null,
  }));
}

const SYSTEM_PROMPT = `You are an operations optimizer for a small electrical services business.

You are given campaign performance data (JSON) and optional prior insight text.

Your task:
1. Identify at most one conservative action per campaign that clearly needs adjustment.
2. Generate SAFE execution plans only — the operator will review; nothing runs automatically.

Hard rules (must obey in output):
- NEVER suggest budget changes above 30% (use field percentage_change between -30 and 30 for budget-related actions).
- ONLY output plans for campaigns that appear in the input (each has leads >= 10 already filtered).
- Prefer small steps: test, then scale.
- Do NOT suggest aggressive cuts or big increases.
- For non-budget actions (pause_campaign, improve_landing_page, improve_ad_copy, investigate_quality), omit percentage_change or set to null.
- For increase_budget / decrease_budget, include details: { "percentage_change": <number -30..30>, "suggested_new_daily_budget": null } (keep suggested_new_daily_budget null unless you have a real platform daily budget figure).

Allowed action strings:
- increase_budget
- decrease_budget
- pause_campaign
- improve_landing_page
- improve_ad_copy
- investigate_quality

Return JSON only (no markdown):
{
  "plans": [
    {
      "campaign": "<exact utm_campaign string from input>",
      "campaign_key": "<exact campaign_key from input>",
      "action": "...",
      "details": { "percentage_change": 15, "suggested_new_daily_budget": null },
      "confidence": 0.7,
      "reason": "short practical reason"
    }
  ]
}

If no safe action is justified, return { "plans": [] }.`;

async function buildPlansWithOpenAI(eligibleRows, insightsBlock) {
  const client = getOpenAIClient();
  if (!client) throw new Error('no_openai');
  const payload = serializeForPlanner(eligibleRows);
  const userContent = `Prior insights (may be empty):\n${insightsBlock}\n\nCampaign data:\n${JSON.stringify(payload)}`;

  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.25,
    max_tokens: 2500,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
  });

  const raw = completion.choices[0]?.message?.content || '{}';
  const parsed = JSON.parse(raw);
  const plans = Array.isArray(parsed.plans) ? parsed.plans : [];
  return plans;
}

const BUDGET_ACTIONS = new Set(['increase_budget', 'decrease_budget']);

function clampPct(n) {
  if (n == null || Number.isNaN(Number(n))) return null;
  const x = Number(n);
  if (x > MAX_PCT) return MAX_PCT;
  if (x < -MAX_PCT) return -MAX_PCT;
  return Math.round(x * 100) / 100;
}

function sanitizeAndFilterPlans(rawPlans, eligibleRows) {
  const allowedKeys = new Set(eligibleRows.map((r) => campaignKey(r)));

  const out = [];
  for (const p of rawPlans) {
    if (!p || typeof p !== 'object') continue;
    const key = String(p.campaign_key || '').trim();
    const utm = String(p.campaign || '').trim();
    let matchedKey = null;
    if (key && allowedKeys.has(key)) matchedKey = key;
    else {
      const rowByUtm = eligibleRows.find((r) => displayCampaign(r) === utm);
      if (rowByUtm) matchedKey = campaignKey(rowByUtm);
    }
    if (!matchedKey || !allowedKeys.has(matchedKey)) continue;

    const action = String(p.action || '').toLowerCase().replace(/\s+/g, '_');
    const allowedActions = new Set([
      'increase_budget',
      'decrease_budget',
      'pause_campaign',
      'improve_landing_page',
      'improve_ad_copy',
      'investigate_quality',
    ]);
    if (!allowedActions.has(action)) continue;

    let details = p.details && typeof p.details === 'object' ? { ...p.details } : {};
    if (BUDGET_ACTIONS.has(action)) {
      const pct = clampPct(details.percentage_change);
      if (pct == null || pct === 0) details = { ...details, percentage_change: 10 };
      else details = { ...details, percentage_change: pct };
      // Placeholder until platform daily budgets are wired; do not trust model guesses.
      details.suggested_new_daily_budget = null;
    } else {
      delete details.percentage_change;
      delete details.suggested_new_daily_budget;
    }

    let conf = Number(p.confidence);
    if (Number.isNaN(conf)) conf = 0.5;
    conf = Math.min(1, Math.max(0, conf));

    const row = eligibleRows.find((r) => campaignKey(r) === matchedKey);
    out.push({
      campaign: row ? displayCampaign(row) : utm || matchedKey,
      campaign_key: matchedKey,
      action,
      details,
      metrics: row ? metricsFromRow(row) : metricsFromRow({}),
      confidence: conf,
      reason: String(p.reason || '').trim().slice(0, 800),
    });
  }
  return out;
}

function buildPlansFallback(eligibleRows) {
  const plans = [];
  for (const r of eligibleRows) {
    const profit = Number(r.profit || 0);
    const cost = Number(r.cost || 0);
    const cr = r.conversion_rate != null ? Number(r.conversion_rate) : null;
    const name = displayCampaign(r);
    const key = campaignKey(r);

    if (cost > 0 && profit < 0) {
      plans.push({
        campaign: name,
        campaign_key: key,
        action: 'decrease_budget',
        details: { percentage_change: -20, suggested_new_daily_budget: null },
        confidence: 0.55,
        reason: 'Negative profit with recorded spend; small pull-back first.',
      });
    } else if (cr != null && cr < 0.04 && Number(r.leads) >= MIN_LEADS) {
      plans.push({
        campaign: name,
        campaign_key: key,
        action: 'improve_landing_page',
        details: {},
        confidence: 0.5,
        reason: 'Conversion is weak vs volume; tighten page before spend.',
      });
    } else if (cost > 0 && profit > 0 && cr != null && cr >= 0.1) {
      plans.push({
        campaign: name,
        campaign_key: key,
        action: 'increase_budget',
        details: { percentage_change: 15, suggested_new_daily_budget: null },
        confidence: 0.55,
        reason: 'Positive profit and solid conversion; modest scale-up only.',
      });
    }
  }
  return sanitizeAndFilterPlans(plans, eligibleRows);
}

/**
 * Log that an action was applied (cooldown). Optional — for future UI / scripts.
 */
async function recordCampaignPlanExecution({ campaignKey, action, notes, createdBy }) {
  try {
    await pool.query(
      `INSERT INTO campaign_action_plan_executions (
         campaign_key, action, status, notes, created_by
       ) VALUES ($1, $2, 'executed', $3, $4)`,
      [campaignKey, action, notes || null, createdBy || null]
    );
  } catch (e) {
    if (/column .*status.*does not exist/i.test(e.message || '')) {
      await pool.query(
        `INSERT INTO campaign_action_plan_executions (campaign_key, action, notes, created_by)
         VALUES ($1, $2, $3, $4)`,
        [campaignKey, action, notes || null, createdBy || null]
      );
      return;
    }
    throw e;
  }
}

async function getCampaignActionPlans() {
  const { eligible } = await getEligibleCampaignContext();
  if (eligible.length === 0) {
    return { plans: [], source: 'fallback' };
  }

  let insightsBlock = '';
  try {
    const ins = await getCampaignRoiInsights();
    insightsBlock = `${ins.summary}\n${JSON.stringify(ins.insights || []).slice(0, 4000)}`;
  } catch (e) {
    console.warn('[campaign-action-plans] insights skipped:', e.message);
  }

  let plans = [];
  let source = 'fallback';
  if (process.env.OPENAI_API_KEY) {
    try {
      const rawPlans = await buildPlansWithOpenAI(eligible, insightsBlock);
      plans = sanitizeAndFilterPlans(rawPlans, eligible);
      source = 'ai';
    } catch (e) {
      console.warn('[campaign-action-plans] OpenAI failed, fallback:', e.message);
    }
  }
  if (source !== 'ai') {
    plans = buildPlansFallback(eligible);
    source = 'fallback';
  }

  return { plans, source };
}

module.exports = {
  getCampaignActionPlans,
  recordCampaignPlanExecution,
  campaignKey,
  metricsFromRow,
  MIN_LEADS,
  COOLDOWN_DAYS,
  MAX_PCT,
};
