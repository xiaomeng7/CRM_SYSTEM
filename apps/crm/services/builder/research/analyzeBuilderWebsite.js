/**
 * Deterministic builder website analysis (PR8D).
 * Optional LLM for profile_summary + ideal_contact_angle only.
 */

const ADELAIDE_SUBURBS = [
  'adelaide',
  'unley',
  'burnside',
  'norwood',
  'prospect',
  'glenelg',
  'henley beach',
  'brighton',
  'mitcham',
  'marion',
  'stirling',
  'adelaide hills',
  'mount barker',
  'port adelaide',
  'north adelaide',
  'walkerville',
  'fullarton',
  'goodwood',
  'blackwood',
  'campbelltown',
  'salisbury',
  'mclaren vale',
  'victor harbor',
  'gawler',
];

const QUALITY_CHECKS = [
  { id: 'project_gallery', label: 'project gallery exists', re: /project|portfolio|gallery|our work|case stud/i, pages: /project|portfolio|gallery|work/i },
  { id: 'architect_mention', label: 'mentions architect / architectural', re: /architect|architectural design|design-led/i },
  { id: 'custom_homes', label: 'mentions custom homes', re: /custom home|custom build|bespoke home/i },
  { id: 'luxury_premium', label: 'mentions luxury / premium', re: /luxury|premium|high-end|high end|prestige/i },
  { id: 'renovations', label: 'mentions renovations', re: /renovation|renovate|extension|alteration/i },
  { id: 'smart_home', label: 'mentions smart home / automation / lighting', re: /smart home|home automation|automation|lighting design|integrated technology/i },
  { id: 'named_team', label: 'has named team / about page', re: /our team|meet the team|director|founder|about us|who we are/i, pages: /about|team/i },
  { id: 'contact_details', label: 'has contact email / phone', re: /[\w.+-]+@[\w.-]+\.\w{2,}|\+?\d[\d\s()-]{7,}\d/i },
];

const RISK_CHECKS = [
  { id: 'volume_builder', label: 'volume builder language', re: /volume builder|display home|house and land|project home|standard range/i },
  { id: 'commercial_only', label: 'commercial-only focus', re: /commercial construction|industrial|warehouse|office fit.?out/i },
  { id: 'sparse_website', label: 'very sparse website', sparse: true },
  { id: 'no_project_gallery', label: 'no project gallery', missing: 'project_gallery' },
  { id: 'no_clear_contact', label: 'no clear contact', missing: 'contact_details' },
  { id: 'maintenance_handyman', label: 'maintenance / handyman focus', re: /handyman|maintenance service|odd jobs|repair service/i },
];

function getOpenAiClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  const OpenAI = require('openai');
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function matchText(text, re) {
  return re.test(text || '');
}

function pageUrlsMatch(pages, re) {
  return (pages || []).some((p) => re.test(p.url || ''));
}

function detectSignals(combinedText, snippets) {
  const text = (combinedText || '').toLowerCase();
  const pages = snippets || [];
  const quality_signals = [];
  const detected = {};

  for (const check of QUALITY_CHECKS) {
    const textHit = matchText(text, check.re);
    const pageHit = check.pages ? pageUrlsMatch(pages, check.pages) : false;
    if (textHit || pageHit) {
      quality_signals.push(check.label);
      detected[check.id] = true;
    }
  }

  const risk_signals = [];
  for (const check of RISK_CHECKS) {
    if (check.sparse) continue;
    if (check.missing) {
      if (!detected[check.missing]) risk_signals.push(check.label);
      continue;
    }
    if (matchText(text, check.re)) risk_signals.push(check.label);
  }

  if ((combinedText || '').length < 500) {
    if (!risk_signals.includes('very sparse website')) {
      risk_signals.push('very sparse website');
    }
  }

  return { quality_signals, risk_signals, detected };
}

function detectSuburbs(combinedText) {
  const lower = (combinedText || '').toLowerCase();
  const found = [];
  for (const suburb of ADELAIDE_SUBURBS) {
    if (lower.includes(suburb)) found.push(suburb.replace(/\b\w/g, (c) => c.toUpperCase()));
  }
  return [...new Set(found)].slice(0, 8);
}

function deriveBuilderFocus(text, detected) {
  const t = (text || '').toLowerCase();
  if (detected.architect_mention || /architectural home|architect-led/i.test(t)) {
    return 'architectural homes';
  }
  if (detected.custom_homes) return 'custom homes';
  if (detected.luxury_premium) return 'luxury residential';
  if (/townhouse|multi.?unit|development/i.test(t)) return 'townhouse development';
  if (detected.renovations) return 'renovations';
  if (/commercial/i.test(t)) return 'commercial';
  if (/volume builder|display home|house and land/i.test(t)) return 'volume builder';
  return 'unknown';
}

function deriveProjectTypes(text, detected) {
  const types = [];
  const t = (text || '').toLowerCase();
  if (detected.custom_homes) types.push('custom_home');
  if (detected.architect_mention || /new build|new home/i.test(t)) types.push('architectural_new_build');
  if (detected.luxury_premium && detected.renovations) types.push('luxury_renovation');
  else if (detected.renovations) types.push('luxury_renovation');
  if (/townhouse|development/i.test(t)) types.push('townhouse');
  if (/small developer| boutique developer/i.test(t)) types.push('small_developer');
  if (/commercial/i.test(t)) types.push('commercial');
  if (!types.length) types.push('unknown');
  return [...new Set(types)];
}

function deriveFitLevels(detected, score) {
  let architectural_fit = 'unknown';
  let luxury_fit = 'unknown';
  let smart_home_fit = 'unknown';

  if (detected.architect_mention || detected.custom_homes) architectural_fit = 'high';
  else if (score >= 50) architectural_fit = 'medium';

  if (detected.luxury_premium) luxury_fit = 'high';
  else if (detected.custom_homes) luxury_fit = 'medium';

  if (detected.smart_home) smart_home_fit = 'high';
  else if (detected.luxury_premium || detected.architect_mention) smart_home_fit = 'medium';

  return { smart_home_fit, architectural_fit, luxury_fit };
}

function computeFitScore(quality_signals, risk_signals, detected, totalChars) {
  const breakdown = { base: 40, quality: 0, risks: 0, details: [] };
  const qualityPoints = {
    'project gallery exists': 10,
    'mentions architect / architectural': 12,
    'mentions custom homes': 10,
    'mentions luxury / premium': 10,
    'mentions renovations': 5,
    'mentions smart home / automation / lighting': 15,
    'has named team / about page': 8,
    'has contact email / phone': 8,
  };
  const riskPoints = {
    'volume builder language': -15,
    'commercial-only focus': -20,
    'very sparse website': -15,
    'no project gallery': -10,
    'no clear contact': -10,
    'maintenance / handyman focus': -20,
  };

  for (const q of quality_signals) {
    const pts = qualityPoints[q] || 0;
    breakdown.quality += pts;
    if (pts) breakdown.details.push({ signal: q, points: pts });
  }
  for (const r of risk_signals) {
    const pts = riskPoints[r] || 0;
    breakdown.risks += pts;
    if (pts) breakdown.details.push({ signal: r, points: pts });
  }

  if (totalChars < 300) {
    breakdown.risks -= 5;
    breakdown.details.push({ signal: 'minimal content', points: -5 });
  }

  const total = Math.max(0, Math.min(100, breakdown.base + breakdown.quality + breakdown.risks));
  breakdown.total = total;
  return { estimated_fit_score: total, score_breakdown: breakdown };
}

function fitPriorityFromScore(score) {
  if (score >= 75) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

function buildDeterministicSummary(companyName, analysis) {
  const name = companyName || 'This builder';
  const focus = analysis.builder_focus !== 'unknown' ? analysis.builder_focus : 'residential building';
  const score = analysis.estimated_fit_score;
  const quality = (analysis.quality_signals || []).slice(0, 3).join('; ') || 'limited public signals';
  return `${name} appears focused on ${focus}. Website analysis found: ${quality}. Estimated fit score ${score}/100 based on deterministic keyword signals.`;
}

function buildDeterministicContactAngle(companyName, analysis) {
  const name = companyName || 'the builder';
  if (analysis.detected?.smart_home || analysis.detected?.architect_mention) {
    return `Position Better Home as a design-aware electrical and smart-home partner for ${name}'s premium residential projects.`;
  }
  if (analysis.detected?.luxury_premium || analysis.detected?.custom_homes) {
    return `Lead with calm, organised on-site coordination for custom/luxury homes — reduce builder programme friction.`;
  }
  return `Introduce Better Home as a reliable residential systems partner after reviewing ${name}'s project focus and fit.`;
}

async function generateLlmNarrative({ companyName, websiteUrl, snippets, signals, builderFocus }) {
  const client = getOpenAiClient();
  if (!client) return null;

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const snippetBlock = (snippets || [])
    .slice(0, 5)
    .map((s) => `- ${s.url}: ${s.snippet}`)
    .join('\n');

  const prompt = `You are helping Better Home Technology evaluate an Adelaide/South Australia builder partnership fit.

Builder: ${companyName}
Website: ${websiteUrl}
Derived focus: ${builderFocus}
Quality signals: ${(signals.quality_signals || []).join('; ')}
Risk signals: ${(signals.risk_signals || []).join('; ')}

Website snippets (short, do not invent facts beyond these):
${snippetBlock}

Respond with JSON only:
{
  "profile_summary": "2-3 sentences, factual, based on snippets only",
  "ideal_contact_angle": "1-2 sentences on how Better Home should approach this builder"
}`;

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 400,
    });
    const raw = completion.choices?.[0]?.message?.content || '';
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1));
    if (!parsed.profile_summary) return null;
    return {
      profile_summary: String(parsed.profile_summary).trim(),
      ideal_contact_angle: parsed.ideal_contact_angle
        ? String(parsed.ideal_contact_angle).trim()
        : null,
    };
  } catch (_) {
    return null;
  }
}

/**
 * @param {object} input
 * @param {string} input.combined_text
 * @param {Array} input.snippets
 * @param {string} [input.company_name]
 * @param {string} [input.website_url]
 * @param {boolean} [input.useLlm]
 */
async function analyzeBuilderWebsite(input) {
  const combined_text = input.combined_text || '';
  const snippets = input.snippets || [];
  const { quality_signals, risk_signals, detected } = detectSignals(combined_text, snippets);
  const target_suburbs = detectSuburbs(combined_text);
  const builder_focus = deriveBuilderFocus(combined_text, detected);
  const project_types = deriveProjectTypes(combined_text, detected);
  const { estimated_fit_score, score_breakdown } = computeFitScore(
    quality_signals,
    risk_signals,
    detected,
    combined_text.length
  );
  const fitLevels = deriveFitLevels(detected, estimated_fit_score);

  const baseAnalysis = {
    quality_signals,
    risk_signals,
    detected,
    target_suburbs,
    builder_focus,
    project_types,
    estimated_fit_score,
    score_breakdown,
    ...fitLevels,
    fit_priority: fitPriorityFromScore(estimated_fit_score),
  };

  let profile_summary = buildDeterministicSummary(input.company_name, baseAnalysis);
  let ideal_contact_angle = buildDeterministicContactAngle(input.company_name, baseAnalysis);
  let usedLlm = false;

  if (input.useLlm !== false && process.env.OPENAI_API_KEY) {
    const llm = await generateLlmNarrative({
      companyName: input.company_name,
      websiteUrl: input.website_url,
      snippets,
      signals: { quality_signals, risk_signals },
      builderFocus: builder_focus,
    });
    if (llm) {
      profile_summary = llm.profile_summary;
      if (llm.ideal_contact_angle) ideal_contact_angle = llm.ideal_contact_angle;
      usedLlm = true;
    }
  }

  return {
    ...baseAnalysis,
    profile_summary,
    ideal_contact_angle,
    research_source: usedLlm ? 'website_fetch_llm' : 'website_fetch',
  };
}

module.exports = {
  analyzeBuilderWebsite,
  detectSignals,
  computeFitScore,
  deriveBuilderFocus,
  deriveProjectTypes,
  deriveFitLevels,
  fitPriorityFromScore,
  buildDeterministicSummary,
  buildDeterministicContactAngle,
  detectSuburbs,
  ADELAIDE_SUBURBS,
};
