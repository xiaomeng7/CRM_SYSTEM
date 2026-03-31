const Anthropic = require('@anthropic-ai/sdk');
const { pool } = require('../lib/db');
const { handleLeadAction } = require('./leadActionEngine');
const {
  computeRuleScore,
  expectedValueFromRules,
  conversionFromRuleScore,
  tierFromFinalScore,
  recommendedActionFromRules,
} = require('./leadScoringRules');

/** Persisted scoring_version inside features JSON (table may not have column). */
const SCORING_VERSION = 'v2-hybrid';
/** Fallback when no LLM row (rules-only); hybrid rows use anthropic | openai. */
const MODEL_PROVIDER = 'claude';
const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest';
const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

/** Fixed blend: final_score = round(rule_score * W_RULE + ai_score * W_AI) */
const W_RULE = 0.3;
const W_AI = 0.7;

function isUuid(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function normalizeTier(v) {
  var s = String(v || '').toLowerCase().trim();
  if (s === 'low' || s === 'medium' || s === 'high' || s === 'vip') return s;
  return 'medium';
}

function normalizeAction(v) {
  var s = String(v || '').toLowerCase().trim();
  var allow = ['ignore', 'send_sms', 'call', 'book_immediately', 'owner_follow_up'];
  return allow.indexOf(s) >= 0 ? s : 'send_sms';
}

function extractJson(text) {
  if (!text) return null;
  var raw = String(text).trim();
  try {
    return JSON.parse(raw);
  } catch (_) {
    var start = raw.indexOf('{');
    var end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch (_) {
        return null;
      }
    }
    return null;
  }
}

async function getLeadContext(leadId) {
  const r = await pool.query(
    `SELECT
       l.id,
       l.source,
       l.status,
       l.utm_source,
       l.utm_medium,
       l.utm_campaign,
       l.utm_term,
       l.utm_content,
       l.product_interest,
       l.budget_signal,
       l.urgency_level,
       l.created_at,
       c.name AS contact_name,
       c.email AS contact_email,
       c.phone AS contact_phone,
       c.role AS contact_role,
       a.name AS account_name,
       a.suburb AS account_suburb,
       a.postcode AS account_postcode
     FROM leads l
     LEFT JOIN contacts c ON c.id = l.contact_id
     LEFT JOIN accounts a ON a.id = l.account_id
     WHERE l.id = $1`,
    [leadId]
  );
  return r.rows[0] || null;
}

function buildPrompts(lead, ruleHint) {
  const systemPrompt = [
    'You are an AI revenue analyst for an electrical and energy advisory business.',
    'Your role is to evaluate incoming leads and determine:',
    '1. How valuable the lead is in revenue terms',
    '2. How likely the lead is to convert',
    '3. What action should be taken immediately',
    'Focus on revenue potential, conversion likelihood, urgency, intent, and fit with high-value services.',
    'A deterministic rule engine already produced a prior score 0–100; your "score" should stay broadly consistent unless free-text or context strongly contradicts it.',
    'Be decisive and return structured JSON only.',
  ].join('\n');

  const userPrompt = [
    'Business context:',
    '- Company: Better Home Technology',
    '- Services: Essential Electrical Report, Energy Advisory, Electrical Installation, CCTV',
    '- Target market: Adelaide property owners, Investors, Property-related customers',
    '',
    'Precomputed rule-based score (0–100):',
    String(ruleHint.rule_score),
    'Rule breakdown:',
    JSON.stringify(ruleHint.breakdown),
    'Rule labels:',
    JSON.stringify(ruleHint.labels),
    '',
    'Lead data (real DB fields, may be null):',
    JSON.stringify(lead, null, 2),
    '',
    'Return strict JSON only in this shape:',
    '{',
    '  "score": number,',
    '  "tier": "low|medium|high|vip",',
    '  "expected_value": number,',
    '  "conversion_probability": number,',
    '  "recommended_action": "ignore|send_sms|call|book_immediately|owner_follow_up",',
    '  "reasoning": "max two sentences"',
    '}',
    '',
    'The "score" field is your ai_score prior to blending (0–100). The "tier" field is ignored downstream;',
    'the system derives tier only from the final blended score.',
  ].join('\n');

  return { systemPrompt, userPrompt };
}

async function callClaude(lead, ruleHint) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');
  const anthropic = new Anthropic({ apiKey });
  const model = DEFAULT_ANTHROPIC_MODEL;
  const prompts = buildPrompts(lead, ruleHint);
  const msg = await anthropic.messages.create({
    model,
    temperature: 0.1,
    max_tokens: 280,
    system: prompts.systemPrompt,
    messages: [{ role: 'user', content: prompts.userPrompt }],
  });
  var text = '';
  (msg.content || []).forEach(function (part) {
    if (part && part.type === 'text') text += part.text || '';
  });
  const parsed = extractJson(text);
  if (!parsed || typeof parsed.score !== 'number') {
    throw new Error('Claude returned non-JSON or missing score');
  }
  const out = {
    score: Math.max(0, Math.min(100, Number(parsed.score))),
    tier: normalizeTier(parsed.tier),
    expected_value: Number(parsed.expected_value || 0),
    conversion_probability: Math.max(0, Math.min(100, Number(parsed.conversion_probability || 0))),
    recommended_action: normalizeAction(parsed.recommended_action),
    reasoning: String(parsed.reasoning || '').slice(0, 400),
    raw: parsed,
    model,
    provider: 'anthropic',
  };
  return out;
}

async function callOpenAi(lead, ruleHint) {
  const OpenAI = require('openai');
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');
  const model = DEFAULT_OPENAI_MODEL;
  const client = new OpenAI({ apiKey });
  const prompts = buildPrompts(lead, ruleHint);
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.1,
    max_tokens: 350,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: prompts.systemPrompt },
      {
        role: 'user',
        content: prompts.userPrompt + '\n\nReturn a single JSON object only (no markdown).',
      },
    ],
  });
  const text = completion.choices[0]?.message?.content || '';
  const parsed = extractJson(text);
  if (!parsed || typeof parsed.score !== 'number') {
    throw new Error('OpenAI returned non-JSON or missing score');
  }
  return {
    score: Math.max(0, Math.min(100, Number(parsed.score))),
    tier: normalizeTier(parsed.tier),
    expected_value: Number(parsed.expected_value || 0),
    conversion_probability: Math.max(0, Math.min(100, Number(parsed.conversion_probability || 0))),
    recommended_action: normalizeAction(parsed.recommended_action),
    reasoning: String(parsed.reasoning || '').slice(0, 400),
    raw: parsed,
    model,
    provider: 'openai',
  };
}

/** Prefer Anthropic when both keys exist; else OpenAI (ChatGPT API). */
async function callLeadScoreLlm(lead, ruleHint) {
  if (process.env.ANTHROPIC_API_KEY) {
    return callClaude(lead, ruleHint);
  }
  if (process.env.OPENAI_API_KEY) {
    return callOpenAi(lead, ruleHint);
  }
  throw new Error('No LLM API key (set ANTHROPIC_API_KEY or OPENAI_API_KEY)');
}

async function getLeadScoreColumns() {
  const r = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'lead_scores'`
  );
  return new Set(r.rows.map((x) => x.column_name));
}

/**
 * @param {object} opts — unified row for INSERT
 */
function columnValueMap(leadId, opts) {
  const {
    final_score,
    rule_score,
    ai_score,
    scoring_method,
    tier,
    expected_value,
    conversion_probability,
    recommended_action,
    reasoning,
    rawAudit,
    model_version,
    leadContext,
    llm_provider,
  } = opts;

  const rationale = {
    reasoning,
    conversion_probability,
    scoring_method,
    rule_score,
    ai_score,
    final_score,
  };
  return {
    lead_id: leadId,
    scoring_version: SCORING_VERSION,
    model_provider: llm_provider != null ? llm_provider : MODEL_PROVIDER,
    score: final_score,
    tier,
    expected_value,
    confidence: conversion_probability,
    recommended_action,
    rationale: JSON.stringify(rationale),
    raw_output: JSON.stringify(rawAudit),
    score_grade: tier,
    model_version,
    reasons: JSON.stringify(
      [reasoning, rule_score != null ? `rule_score=${rule_score}` : null, ai_score != null ? `ai_score=${ai_score}` : null].filter(
        Boolean
      )
    ),
    features: JSON.stringify({
      scoring_version: SCORING_VERSION,
      source: leadContext.source,
      utm_source: leadContext.utm_source,
      urgency_level: leadContext.urgency_level,
      product_interest: leadContext.product_interest,
      budget_signal: leadContext.budget_signal,
      rule_breakdown: rawAudit.rule_breakdown,
      rule_labels: rawAudit.rule_labels,
      scoring_method,
      rule_score,
      ai_score,
      final_score,
      blend: rawAudit.blend || null,
    }),
    scored_at: new Date().toISOString(),
    rule_score,
    ai_score,
    scoring_method,
  };
}

async function insertLeadScoreDynamic(leadId, opts) {
  const cols = await getLeadScoreColumns();
  const map = columnValueMap(leadId, opts);
  const wanted = Object.keys(map).filter((k) => cols.has(k));
  if (!wanted.length || !cols.has('lead_id') || !cols.has('score')) {
    throw new Error('lead_scores schema not compatible (missing lead_id/score)');
  }
  const values = [];
  const placeholders = [];
  wanted.forEach((col, i) => {
    values.push(map[col]);
    placeholders.push('$' + (i + 1));
  });
  const query = `INSERT INTO lead_scores (${wanted.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
  const ins = await pool.query(query, values);
  return ins.rows[0];
}

async function scoreLeadAndPersist(leadId, options = {}) {
  if (!isUuid(leadId)) throw new Error('Invalid lead_id');
  const lead = await getLeadContext(leadId);
  if (!lead) throw new Error('Lead not found');

  const { rule_score, breakdown, labels } = computeRuleScore(lead);
  const ruleHint = { rule_score, breakdown, labels };

  let ai_score = null;
  let aiPayload = null;
  let scoring_method = 'rules_only';

  if (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) {
    try {
      aiPayload = await callLeadScoreLlm(lead, ruleHint);
      ai_score = aiPayload.score;
      scoring_method = 'hybrid';
    } catch (e) {
      scoring_method = 'rules_fallback';
      if (!options.silent) {
        console.warn('[lead-score] AI failed, using rule fallback:', e.message);
      } else {
        console.warn('[lead-score] AI failed (lead preserved):', e.message);
      }
    }
  }

  const final_score =
    ai_score != null ? Math.round(rule_score * W_RULE + ai_score * W_AI) : rule_score;

  const tier = tierFromFinalScore(final_score);

  let expected_value;
  let conversion_probability;
  let recommended_action;
  let reasoning;

  if (aiPayload) {
    expected_value = aiPayload.expected_value;
    conversion_probability = aiPayload.conversion_probability;
    recommended_action = aiPayload.recommended_action;
    reasoning = `(rules ${rule_score} + AI ${ai_score}) ${aiPayload.reasoning}`.slice(0, 500);
  } else {
    expected_value = expectedValueFromRules(lead, rule_score);
    conversion_probability = conversionFromRuleScore(rule_score);
    recommended_action = recommendedActionFromRules(lead, rule_score);
    reasoning = `Rule-based score ${rule_score}: ${labels.join(', ')}`.slice(0, 500);
  }

  const model_version =
    scoring_method === 'hybrid'
      ? `hybrid:0.3r+0.7a:${aiPayload.model}`
      : scoring_method === 'rules_fallback'
        ? `rules_fallback:${process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY ? 'ai_error' : 'no_key'}`
        : 'rules@v1';

  const rawAudit = {
    rule_breakdown: breakdown,
    rule_labels: labels,
    ai_raw: aiPayload ? aiPayload.raw : null,
    blend:
      ai_score != null
        ? { w_rule: W_RULE, w_ai: W_AI, rule_score, ai_score, final_score }
        : { rule_score, final_score },
    scoring_method,
  };

  const opts = {
    final_score,
    rule_score,
    ai_score,
    scoring_method,
    tier,
    expected_value,
    conversion_probability,
    recommended_action,
    reasoning,
    rawAudit,
    model_version,
    leadContext: lead,
    llm_provider: aiPayload ? aiPayload.provider : null,
  };

  try {
    const row = await insertLeadScoreDynamic(leadId, opts);
    try {
      await handleLeadAction(Object.assign({}, row, { tier, recommended_action }));
    } catch (actionErr) {
      console.warn('[lead-action-engine] after score insert:', actionErr.message || actionErr);
    }
    return {
      score: final_score,
      rule_score,
      ai_score,
      scoring_method,
      tier,
      expected_value,
      conversion_probability,
      recommended_action,
      reasoning,
      row,
    };
  } catch (e) {
    console.error('[lead-score] db insert failed:', e.message);
    throw e;
  }
}

function scheduleLeadScoring(leadId) {
  setTimeout(function () {
    scoreLeadAndPersist(leadId, { silent: true }).catch(function (e) {
      console.warn('[lead-score] async scoring failed (lead preserved):', e.message);
    });
  }, 0);
}

async function summarizeWeeklyMetrics(metrics) {
  const userContent =
    'Summarize weekly CRM performance in 4 bullet points with one key risk and one next action. Data: ' +
    JSON.stringify(metrics);
  try {
    if (process.env.ANTHROPIC_API_KEY) {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const msg = await anthropic.messages.create({
        model: DEFAULT_ANTHROPIC_MODEL,
        max_tokens: 220,
        temperature: 0.2,
        messages: [{ role: 'user', content: userContent }],
      });
      var text = '';
      (msg.content || []).forEach(function (part) {
        if (part && part.type === 'text') text += part.text || '';
      });
      return text.trim() || null;
    }
    if (process.env.OPENAI_API_KEY) {
      const OpenAI = require('openai');
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await client.chat.completions.create({
        model: DEFAULT_OPENAI_MODEL,
        max_tokens: 220,
        temperature: 0.2,
        messages: [{ role: 'user', content: userContent }],
      });
      const t = completion.choices[0]?.message?.content || '';
      return t.trim() || null;
    }
    return null;
  } catch (_) {
    return null;
  }
}

/**
 * Evaluate rule + optional AI blend on a synthetic lead context (no DB).
 * Same shape as getLeadContext row; for scripts / QA only.
 */
async function previewHybridScores(leadContext, options = {}) {
  const lead = leadContext && typeof leadContext === 'object' ? leadContext : {};
  const { rule_score, breakdown, labels } = computeRuleScore(lead);
  const ruleHint = { rule_score, breakdown, labels };
  let ai_score = null;
  let aiPayload = null;
  let scoring_method = 'rules_only';
  if ((process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) && !options.rulesOnly) {
    try {
      aiPayload = await callLeadScoreLlm(lead, ruleHint);
      ai_score = aiPayload.score;
      scoring_method = 'hybrid';
    } catch (e) {
      scoring_method = 'rules_fallback';
      if (!options.silent) {
        console.warn('[lead-score] preview AI failed:', e.message);
      }
    }
  }
  const final_score =
    ai_score != null ? Math.round(rule_score * W_RULE + ai_score * W_AI) : rule_score;
  const tier = tierFromFinalScore(final_score);
  let recommended_action;
  if (aiPayload) {
    recommended_action = aiPayload.recommended_action;
  } else {
    recommended_action = recommendedActionFromRules(lead, rule_score);
  }
  return {
    rule_score,
    ai_score,
    final_score,
    tier,
    recommended_action,
    scoring_method,
    ai_reasoning: aiPayload ? aiPayload.reasoning : null,
    rule_labels: labels,
  };
}

module.exports = {
  scoreLeadAndPersist,
  scheduleLeadScoring,
  summarizeWeeklyMetrics,
  previewHybridScores,
};
