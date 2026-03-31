/**
 * Ad Generation Engine v1 — copy + landing variants, persist + read API helpers.
 * Uses OpenAI gpt-4o-mini when OPENAI_API_KEY is set; otherwise template fallback.
 * Does not publish ads or call OpenClaw.
 */

const { pool } = require('../lib/db');
const { getCampaignRoiInsights, fetchCampaignRoiRows } = require('./campaignRoiInsights');

const MODEL = 'gpt-4o-mini';

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  const OpenAI = require('openai');
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const AD_COPY_SYSTEM = `You write ad copy for a small Australian home-services business (licensed electrical work, energy advisory, safety inspections, CCTV, essential electrical reports).

Audience: local homeowners, landlords, and property investors — practical, not naive. This is an ADVISORY and INSPECTION business, not a cheap tradie or emergency repair service.

Rules:
- Three distinct angles across variants: (1) compliance/risk clarity — what could go wrong and what this prevents; (2) decision support — helping them make an informed property decision; (3) professional credibility — licensed, independent, written outputs.
- DO NOT use speed or urgency as an angle. "Fast", "quick", "same-day", "emergency" attract the wrong customers (low-value, single-job seekers). Omit entirely.
- DO NOT use "free" anywhere. This is a paid advisory service.
- Plain, conversational Australian English. No hype, no ALL CAPS, no fake urgency countdowns.
- No unverifiable superlatives ("best", "#1"). No medical or legal claims.
- Headlines: channel-aware — if channel is "google", keep headline under ~35 characters when possible for RSAs; if "meta", can be slightly longer.
- body_text: 1–3 short sentences, suitable as ad description or primary text.
- call_to_action: short button-style phrase (e.g. "Book a licensed visit", "Get a fixed quote", "Request an advisory report").

Return JSON only (no markdown) with exactly this shape:
{
  "variants": [
    { "variant_label": "A", "headline": "string", "body_text": "string", "call_to_action": "string" },
    { "variant_label": "B", "headline": "string", "body_text": "string", "call_to_action": "string" },
    { "variant_label": "C", "headline": "string", "body_text": "string", "call_to_action": "string" }
  ]
}`;

/** Legacy generic landing prompt (used when no strategy signals). */
const LANDING_SYSTEM = `You write landing-page blocks for a small Australian electrical / energy advisory business.

Goal: attract and FILTER for high-value clients — homeowners, landlords, and investors making real property decisions. Not price shoppers, not emergency-repair seekers.

Rules:
- Two clearly different value angles (e.g. clarity on scope & price vs. compliance/safety peace of mind).
- headline: specific benefit or outcome, not generic "Welcome".
- subheadline: supports headline with one concrete detail (who it's for, what's included, or what happens next).
- cta_text: action-oriented, low friction. NEVER use "free" — this is a paid advisory service.
- supporting_angle: one short internal note on the positioning angle (e.g. "landlord compliance focus").
- Do NOT use urgency or speed language ("today only", "fast", "quick", "instant"). This is not an emergency service.

Return JSON only (no markdown) with exactly this shape:
{
  "variants": [
    { "variant_label": "A", "headline": "string", "subheadline": "string", "cta_text": "string", "supporting_angle": "string" },
    { "variant_label": "B", "headline": "string", "subheadline": "string", "cta_text": "string", "supporting_angle": "string" }
  ]
}`;

/** Strategy-aware landing: advisory / qualification-first (matches landingExecutionPlanner + intelligence layer). */
const LANDING_ADVISORY_SYSTEM = `You write landing page hero/CTA draft blocks for an Australian INDEPENDENT ELECTRICAL RISK AND ENERGY ADVISORY practice (written advice, decision support — not a discount tradie job board).

Non-negotiables:
- Goal is NOT to maximise submissions from everyone. Goal is to attract and FILTER for high-value, advisory-fit clients (homeowners with meaningful bills, investors, people making energy/compliance decisions).
- Do NOT write copy that sounds like: cheap electrician, emergency repair shop, "lowest quote", or urgent handyman landing pages.
- Emphasise independence, clarity, and optional written outputs where appropriate. No fake urgency, no ALL CAPS hype.
- Plain Australian English. No unverifiable superlatives. No medical or legal claims.
- You are given a structured task (change_type / strategy) decided by rules upstream — implement that task in copy, do not substitute a generic landing.

Return JSON only (no markdown) with exactly this shape:
{
  "variants": [
    { "variant_label": "A", "headline": "string", "subheadline": "string", "cta_text": "string", "supporting_angle": "string" },
    { "variant_label": "B", "headline": "string", "subheadline": "string", "cta_text": "string", "supporting_angle": "string" }
  ]
}`;

const CANONICAL_LANDING_STRATEGIES = new Set([
  'strengthen_primary_cta',
  'clarify_value_proposition',
  'reduce_form_friction',
  'add_trust_section',
  'add_disqualification_section',
]);

/**
 * @param {{ source_context?: object, page_key?: string, page_path?: string | null }} input
 */
function extractLandingSignals(input) {
  const ctx = input && typeof input.source_context === 'object' ? input.source_context : {};
  const sig = ctx.landing_generation_signals && typeof ctx.landing_generation_signals === 'object'
    ? ctx.landing_generation_signals
    : {};
  const gte = ctx.growth_task_executor && typeof ctx.growth_task_executor === 'object'
    ? ctx.growth_task_executor
    : {};
  const payload = gte.payload && typeof gte.payload === 'object' ? gte.payload : {};

  const warningsFrom = Array.isArray(sig.warnings) ? sig.warnings : Array.isArray(payload.warnings) ? payload.warnings : [];

  return {
    page_path: input.page_path != null ? String(input.page_path) : sig.page_path != null ? String(sig.page_path) : payload.page_path != null ? String(payload.page_path) : null,
    page_key: input.page_key != null ? String(input.page_key) : sig.page_key != null ? String(sig.page_key) : payload.page_key != null ? String(payload.page_key) : null,
    change_type: sig.change_type != null ? String(sig.change_type) : payload.change_type != null ? String(payload.change_type) : null,
    strategy: sig.strategy != null ? String(sig.strategy) : payload.strategy != null ? String(payload.strategy) : null,
    source_insight: sig.source_insight != null ? String(sig.source_insight) : payload.source_insight != null ? String(payload.source_insight) : null,
    warnings: warningsFrom.map((w) => String(w)),
  };
}

function hasStrategySignals(signals) {
  return !!(signals && (signals.strategy || signals.change_type));
}

/**
 * @param {string[]} warnings
 */
function buildWarningToneDirective(warnings) {
  const w = (warnings || []).join('\n');
  const roiUncertain =
    /roi_campaign_approximate|roi_utm_only_match|roi_no_row/i.test(w);
  const noLeads = /no_leads_for_page/i.test(w);
  const lines = ['=== Warning-driven tone (must follow) ==='];
  if (roiUncertain) {
    lines.push(
      '- Attribution/ROI data for this page or campaign may be incomplete or approximate. Write in a CONSERVATIVE voice: no strong performance claims, no "guaranteed" outcomes. Prefer clarity, qualification, and honest framing.'
    );
  }
  if (noLeads) {
    lines.push(
      '- Traffic may not yet match CRM leads for this path: slightly strengthen WHO should enquire and the single clearest next step — without lowering standards or chasing raw volume.'
    );
  }
  if (!roiUncertain && !noLeads) {
    lines.push(
      '- Default: professional, advisory, selective — welcome the right clients and implicitly discourage poor-fit enquiries.'
    );
  }
  return lines.join('\n');
}

/**
 * Detailed task instructions per planner strategy (rules layer — model executes only).
 * @param {{ change_type?: string | null, strategy?: string | null }} signals
 */
function buildStrategyTaskDirective(signals) {
  const strat = signals.strategy && CANONICAL_LANDING_STRATEGIES.has(signals.strategy) ? signals.strategy : null;
  const ct = signals.change_type ? String(signals.change_type).toLowerCase() : null;

  const byStrategy = {
    strengthen_primary_cta: `TASK: Primary CTA focus (change_type=cta).
- Strengthen the main call-to-action: name the next step (e.g. brief enquiry, book a structured call) clearly.
- Headline and subheadline should reinforce WHO this is for and what happens next — not discounts or speed for tiny jobs.
- supporting_angle must reflect clarity / decision / next step (not "cheap" or "fast fix").
- cta_text: decisive but respectful; no bait pricing.`,

    clarify_value_proposition: `TASK: Hero / value proposition (change_type=hero).
- Rewrite headline + subheadline to explain this is independent advisory and decision support — not sales-driven installation upsell or emergency cheap labour.
- Emphasise: independent, advisory, no sales pressure where appropriate.
- supporting_angle: independent advisory / decision support framing.
- CTA should stay measured — clarity before aggression.`,

    reduce_form_friction: `TASK: Form framing (change_type=form).
- Do NOT remove qualification to chase submit rate. Make the NEXT STEP easier for already-interested, qualified readers only.
- Softer CTA wording; explain what happens after submit (e.g. scope check, suitability) in subheadline or cta_text.
- supporting_angle: simple next step / low friction for qualified users only.`,

    add_trust_section: `TASK: Trust / credibility (change_type=trust).
- supporting_angle and copy should emphasise trust: local presence where true, independence, written advice, no commissions on products if that applies to the business model (use neutral "fee-for-advice style" if unsure).
- Headline/subheadline may adjust slightly but the MAIN lift should be trust framing in supporting_angle and supportive lines in subheadline.
- Avoid aggressive conversion tactics.`,

    add_disqualification_section: `TASK: Qualification / disqualification (change_type=qualification).
- Actively discourage poor-fit enquiries: NOT for small one-off repairs, cheapest-quote hunting, or urgent handyman-style jobs (word diplomatically).
- Clearly welcome homeowners / investors / people making meaningful energy or compliance decisions.
- supporting_angle: who this is for / who this is not for.
- CTA must NOT become more aggressive; it should invite the RIGHT people only.`,
  };

  if (strat && byStrategy[strat]) {
    return byStrategy[strat];
  }

  if (ct === 'cta') return byStrategy.strengthen_primary_cta;
  if (ct === 'hero') return byStrategy.clarify_value_proposition;
  if (ct === 'form') return byStrategy.reduce_form_friction;
  if (ct === 'trust') return byStrategy.add_trust_section;
  if (ct === 'qualification') return byStrategy.add_disqualification_section;

  return `TASK: General advisory landing improvement.
- Two distinct variants; both must stay aligned with independent advisory and selective qualification (not mass lead capture).`;
}

function buildLandingStrategyUserBlock(input, contextBlock, signals) {
  const pk = signals.page_key || input.page_key || 'general_landing';
  const pp = signals.page_path || '(not set)';
  const si = signals.source_insight || '(none)';
  const warnList =
    signals.warnings && signals.warnings.length
      ? signals.warnings.map((x) => `- ${x}`).join('\n')
      : '- (none)';

  return `${contextBlock}

=== Landing generation task (structured signals) ===
page_key: ${pk}
page_path: ${pp}
change_type: ${signals.change_type || '(unspecified)'}
strategy: ${signals.strategy || '(unspecified)'}
source_insight: ${si}
warnings:
${warnList}

${buildWarningToneDirective(signals.warnings)}

=== Strategy-specific requirements ===
${buildStrategyTaskDirective(signals)}

Produce the JSON object with exactly 2 variants (A and B) with clearly different angles while obeying the same strategy task.`;
}

function resolveFallbackStrategyKey(signals) {
  const s = signals.strategy && CANONICAL_LANDING_STRATEGIES.has(signals.strategy) ? signals.strategy : null;
  if (s) return s;
  const ct = signals.change_type ? String(signals.change_type).toLowerCase() : null;
  const map = {
    cta: 'strengthen_primary_cta',
    hero: 'clarify_value_proposition',
    form: 'reduce_form_friction',
    trust: 'add_trust_section',
    qualification: 'add_disqualification_section',
  };
  return ct && map[ct] ? map[ct] : '_default';
}

function appendWarningNoteToAngle(angle, warnings) {
  const w = (warnings || []).join(' ');
  if (/roi_campaign_approximate|roi_utm_only_match|roi_no_row/i.test(w)) {
    return `${angle} [tone: conservative claims — ROI/attribution uncertain]`;
  }
  if (/no_leads_for_page/i.test(w)) {
    return `${angle} [emphasis: path/clarity for matched enquiries]`;
  }
  return angle;
}

/**
 * Strategy-differentiated template fallbacks (no OpenAI).
 * @param {{ product_focus?: string, audience_segment?: string }} input
 * @param {ReturnType<typeof extractLandingSignals>} signals
 */
function buildStrategyFallbackVariantPair(input, signals) {
  const key = resolveFallbackStrategyKey(signals);
  const pl = productLabel(input.product_focus);
  const al = audienceLabel(input.audience_segment);

  /** @type {Record<string, { A: object, B: object }>} */
  const table = {
    strengthen_primary_cta: {
      A: {
        headline: `Clear next step for ${pl}`,
        subheadline: `If you’re ${al} planning a serious energy or compliance decision, here’s the single action to start — we’ll confirm fit before any commitment.`,
        cta_text: 'Request a suitability check',
        supporting_angle: 'clarity / decisive next step / qualified enquiries only',
      },
      B: {
        headline: 'Independent advice — structured first conversation',
        subheadline: 'No pricing gimmicks. We outline scope and whether advisory work makes sense before you invest time.',
        cta_text: 'Book a short scope conversation',
        supporting_angle: 'next step clarity / filter low-intent clicks',
      },
    },
    clarify_value_proposition: {
      A: {
        headline: 'Independent electrical risk & energy advisory',
        subheadline: `Written, impartial guidance for ${al} — decision support, not a sales-led install push.`,
        cta_text: 'See how advisory fits your situation',
        supporting_angle: 'independent advisory / decision support / no sales pressure',
      },
      B: {
        headline: 'Not a “cheap job” service — strategic electrical clarity',
        subheadline: 'We focus on reports, risk clarity, and energy decisions. Small urgent repairs are not our core offer.',
        cta_text: 'Check if we’re the right fit',
        supporting_angle: 'positioning vs discount tradie positioning',
      },
    },
    reduce_form_friction: {
      A: {
        headline: 'A lighter step for qualified enquiries',
        subheadline: `Short form: tell us your situation. We respond with what happens next — suitability first, not a hard sell for ${al}.`,
        cta_text: 'Send a brief enquiry',
        supporting_angle: 'low friction for qualified users / expectations explained',
      },
      B: {
        headline: 'What we need to advise properly',
        subheadline: 'Only the essentials to judge fit and route you to the right advisory output — we don’t farm leads.',
        cta_text: 'Start with the basics',
        supporting_angle: 'form framing without removing qualification',
      },
    },
    add_trust_section: {
      A: {
        headline: 'Independent advice you can rely on',
        subheadline: 'Fee-for-advice style engagement: written outputs where appropriate, no product commissions driving recommendations.',
        cta_text: 'Learn how we work',
        supporting_angle: 'trust / credibility / independence / written advice',
      },
      B: {
        headline: 'Local, licensed context — advisory-first',
        subheadline: 'Transparent process: who we help, who we don’t, and how recommendations are documented.',
        cta_text: 'Read our approach',
        supporting_angle: 'trust strip / methodology / no hype',
      },
    },
    add_disqualification_section: {
      A: {
        headline: 'Built for energy & compliance decisions — not quick repairs',
        subheadline: `Not for smallest jobs, “cheapest quote” races, or urgent handyman fixes. Ideal for ${al} with meaningful bills, solar/battery, or compliance clarity needs.`,
        cta_text: 'Enquire if this matches your situation',
        supporting_angle: 'qualification / who not for / who for',
      },
      B: {
        headline: 'Selective advisory practice',
        subheadline: 'We decline work that isn’t a fit — that protects your time and ours. Investors and homeowners planning upgrades welcome.',
        cta_text: 'Check fit before enquiring',
        supporting_angle: 'disqualification / filter low-value demand',
      },
    },
    _default: {
      A: {
        headline: `${pl} — clear scope for serious enquiries`,
        subheadline: `Independent guidance for ${al}. We qualify fit before committing effort.`,
        cta_text: 'Request a callback',
        supporting_angle: 'advisory default / selective funnel',
      },
      B: {
        headline: 'Advice-first electrical clarity',
        subheadline: 'Avoiding race-to-the-bottom pricing narratives; focused on decisions that warrant written advisory output.',
        cta_text: 'Speak with an adviser',
        supporting_angle: 'trust / qualification balance',
      },
    },
  };

  const pair = table[key] || table._default;
  return { A: { ...pair.A }, B: { ...pair.B } };
}

function productLabel(pf) {
  const m = {
    energy_advisory: 'energy advisory and bill / efficiency guidance',
    essential_report: 'essential electrical safety reports',
    cctv: 'CCTV and security camera installation',
    electrical: 'general licensed electrical work',
  };
  return m[pf] || 'licensed electrical and home services';
}

function audienceLabel(seg) {
  const m = {
    landlord: 'residential landlords and rental properties',
    homeowner: 'owner-occupier homeowners',
    investor: 'property investors',
    urgent_electrical: 'people needing prompt electrical help',
  };
  return m[seg] || 'local property owners';
}

function buildUserContextBlock(input, extra = {}) {
  const lines = [
    `channel: ${input.channel}`,
    `product_focus: ${input.product_focus || 'unspecified'} (${productLabel(input.product_focus)})`,
    `audience_segment: ${input.audience_segment || 'unspecified'} (${audienceLabel(input.audience_segment)})`,
  ];
  if (input.campaign_id) lines.push(`campaign_id: ${input.campaign_id}`);
  if (input.campaign_key) lines.push(`campaign_key: ${input.campaign_key}`);
  if (extra.campaign) {
    lines.push(`campaign_name: ${extra.campaign.name || ''}`);
    lines.push(`campaign_code: ${extra.campaign.code || ''}`);
    lines.push(`campaign_objective: ${extra.campaign.objective || ''}`);
  }
  if (extra.roi_summary_row) {
    lines.push(`roi_metrics: ${JSON.stringify(extra.roi_summary_row)}`);
  }
  if (extra.relevant_insights?.length) {
    lines.push(`relevant_insights: ${JSON.stringify(extra.relevant_insights)}`);
  }
  if (extra.insights_summary) {
    lines.push(`portfolio_insights_summary: ${extra.insights_summary}`);
  }
  return lines.join('\n');
}

function normalizeAdVariants(raw, input) {
  const list = Array.isArray(raw?.variants) ? raw.variants : [];
  const out = [];
  const labels = ['A', 'B', 'C'];
  for (let i = 0; i < 3; i++) {
    const v = list[i] || {};
    out.push({
      variant_label: String(v.variant_label || labels[i]).slice(0, 50) || labels[i],
      headline: String(v.headline || '').trim() || fallbackAdHeadline(input, i),
      body_text: String(v.body_text || '').trim() || fallbackAdBody(input, i),
      call_to_action: String(v.call_to_action || '').trim() || 'Book a licensed electrician',
    });
  }
  return out;
}

function normalizeLandingVariants(raw, input, signals) {
  const sig = signals !== undefined ? signals : extractLandingSignals(input);
  const list = Array.isArray(raw?.variants) ? raw.variants : [];
  const useStrategy = hasStrategySignals(sig);
  const pair = useStrategy ? buildStrategyFallbackVariantPair(input, sig) : null;
  const out = [];
  const labels = ['A', 'B'];
  for (let i = 0; i < 2; i++) {
    const v = list[i] || {};
    const fbRow = pair && useStrategy ? (i === 0 ? pair.A : pair.B) : null;
    const angleBase = fbRow
      ? fbRow.supporting_angle
      : String(fallbackLpAngle(input, i) || '').trim() || 'advisory / selective funnel';
    out.push({
      variant_label: String(v.variant_label || labels[i]).slice(0, 50) || labels[i],
      headline: String(v.headline || '').trim() || (fbRow ? fbRow.headline : fallbackLpHeadline(input, i)),
      subheadline: String(v.subheadline || '').trim() || (fbRow ? fbRow.subheadline : fallbackLpSub(input, i)),
      cta_text: String(v.cta_text || '').trim() || (fbRow ? fbRow.cta_text : 'Request a callback'),
      supporting_angle: String(v.supporting_angle || '').trim() || appendWarningNoteToAngle(angleBase, sig.warnings),
    });
  }
  return out;
}

function fallbackAdHeadline(input, i) {
  const pf = productLabel(input.product_focus);
  const hooks = [
    `Licensed help for ${pf.split(' ').slice(0, 3).join(' ')}`,
    `Fixed quotes · local electricians`,
    `Safety-first electrical visits`,
  ];
  return hooks[i % hooks.length];
}

function fallbackAdBody(input, i) {
  const aud = audienceLabel(input.audience_segment);
  const bodies = [
    `We work with ${aud} in your area. Clear scope before we start.`,
    `Straightforward advice and tidy workmanship — no pushy upsells.`,
    `Need something looked at urgently? We'll prioritise safety and next steps.`,
  ];
  return bodies[i % bodies.length];
}

function fallbackLpHeadline(input, i) {
  return i === 0
    ? `${productLabel(input.product_focus)} — clear scope & pricing`
    : `Trusted local electricians for ${audienceLabel(input.audience_segment)}`;
}

function fallbackLpSub(input, i) {
  return i === 0
    ? 'Tell us what you need; we confirm what’s involved before work begins.'
    : 'Licensed, insured team. We focus on compliance and lasting fixes.';
}

function fallbackLpAngle(input, i) {
  return i === 0 ? 'transparency / scope' : 'trust / compliance';
}

async function generateAdVariantsWithOpenAI(input, contextBlock) {
  const client = getOpenAIClient();
  if (!client) throw new Error('no_openai');

  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.55,
    max_tokens: 1200,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: AD_COPY_SYSTEM },
      {
        role: 'user',
        content: `Context:\n${contextBlock}\n\nProduce the JSON object with exactly 3 variants.`,
      },
    ],
  });

  const rawText = completion.choices[0]?.message?.content || '{}';
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (_) {
    throw new Error('invalid_ad_json');
  }
  return {
    variants: normalizeAdVariants(parsed, input),
    model_provider: 'openai',
    model_version: MODEL,
    generation_method: 'ai',
  };
}

async function generateLandingVariantsWithOpenAI(input, contextBlock) {
  const client = getOpenAIClient();
  if (!client) throw new Error('no_openai');

  const signals = extractLandingSignals(input);
  const useStrategyPath = hasStrategySignals(signals);
  const systemPrompt = useStrategyPath ? LANDING_ADVISORY_SYSTEM : LANDING_SYSTEM;
  const userContent = useStrategyPath
    ? buildLandingStrategyUserBlock(input, contextBlock, signals)
    : `Context:\n${contextBlock}\npage_key: ${input.page_key || 'general_landing'}\n\nProduce the JSON object with exactly 2 variants.`;

  const roiUncertain = (signals.warnings || []).some((w) =>
    /roi_campaign_approximate|roi_utm_only_match|roi_no_row/i.test(String(w))
  );
  const temperature = useStrategyPath ? (roiUncertain ? 0.38 : 0.48) : 0.55;
  const max_tokens = useStrategyPath ? 1100 : 900;

  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature,
    max_tokens,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
  });

  const rawText = completion.choices[0]?.message?.content || '{}';
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (_) {
    throw new Error('invalid_landing_json');
  }
  return {
    variants: normalizeLandingVariants(parsed, input, signals),
    model_provider: 'openai',
    model_version: MODEL,
    generation_method: 'ai',
  };
}

/**
 * Build campaign + ROI + insights context for prompts (and source_context JSON).
 * @param {{ campaign_id?: string, campaign_key?: string }} ref
 */
async function getGenerationInputFromCampaign(ref = {}) {
  const { campaign_id, campaign_key } = ref;
  if (!campaign_id && !campaign_key) return null;

  let campaign = null;
  if (campaign_id) {
    const r = await pool.query(
      `SELECT id, code, name, objective, status, source_id, metadata
       FROM campaigns WHERE id = $1::uuid
       LIMIT 1`,
      [campaign_id]
    );
    campaign = r.rows[0] || null;
  } else {
    const r = await pool.query(
      `SELECT id, code, name, objective, status, source_id, metadata
       FROM campaigns WHERE code = $1 OR name = $1
       LIMIT 1`,
      [String(campaign_key).trim()]
    );
    campaign = r.rows[0] || null;
  }

  let allRoi = [];
  try {
    allRoi = await fetchCampaignRoiRows();
  } catch (_) {
    allRoi = [];
  }

  let roi_summary_row = null;
  if (campaign) {
    roi_summary_row =
      allRoi.find((x) => x.campaign_id && String(x.campaign_id) === String(campaign.id)) ||
      allRoi.find(
        (x) =>
          x.utm_campaign &&
          campaign.code &&
          String(x.utm_campaign).trim() === String(campaign.code).trim()
      ) ||
      null;
  }

  const insightsPack = await getCampaignRoiInsights();
  const cLabel = campaign ? String(campaign.code || campaign.name || '').trim() : String(campaign_key || '').trim();
  const relevant_insights = insightsPack.insights.filter((i) => {
    const s = String(i.campaign || '');
    if (!cLabel) return false;
    if (s.includes(cLabel)) return true;
    if (campaign?.name && s.includes(String(campaign.name))) return true;
    if (campaign?.id && s.includes(String(campaign.id))) return true;
    return false;
  });

  const serializedRoi = roi_summary_row
    ? {
        campaign_id: roi_summary_row.campaign_id,
        utm_campaign: roi_summary_row.utm_campaign,
        leads: roi_summary_row.leads != null ? Number(roi_summary_row.leads) : null,
        wins: roi_summary_row.wins != null ? Number(roi_summary_row.wins) : null,
        revenue: roi_summary_row.revenue != null ? Number(roi_summary_row.revenue) : null,
        cost: roi_summary_row.cost != null ? Number(roi_summary_row.cost) : null,
        profit: roi_summary_row.profit != null ? Number(roi_summary_row.profit) : null,
        conversion_rate:
          roi_summary_row.conversion_rate != null ? Number(roi_summary_row.conversion_rate) : null,
        revenue_per_lead:
          roi_summary_row.revenue_per_lead != null ? Number(roi_summary_row.revenue_per_lead) : null,
      }
    : null;

  return {
    campaign: campaign
      ? {
          id: campaign.id,
          code: campaign.code,
          name: campaign.name,
          objective: campaign.objective,
          status: campaign.status,
          source_id: campaign.source_id,
          metadata: campaign.metadata,
        }
      : null,
    roi_summary_row: serializedRoi,
    insights_summary: insightsPack.summary,
    insights_source: insightsPack.source,
    relevant_insights: relevant_insights.slice(0, 8),
  };
}

/**
 * @param {{ channel: 'google'|'meta', product_focus?: string, audience_segment?: string, campaign_id?: string, campaign_key?: string, source_context?: object }} input
 */
async function generateAdVariants(input) {
  const channel = String(input.channel || 'google').toLowerCase();
  if (channel !== 'google' && channel !== 'meta') {
    throw new Error('channel must be google or meta');
  }

  const ctx = input.source_context || {};
  const block = buildUserContextBlock(
    { ...input, channel },
    {
      campaign: ctx.campaign,
      roi_summary_row: ctx.roi_summary_row,
      relevant_insights: ctx.relevant_insights,
      insights_summary: ctx.insights_summary,
    }
  );

  if (process.env.OPENAI_API_KEY) {
    try {
      return await generateAdVariantsWithOpenAI({ ...input, channel }, block);
    } catch (e) {
      console.warn('[ad-generation-engine] OpenAI ad variants failed, using template:', e.message || e);
    }
  }

  return {
    variants: normalizeAdVariants({ variants: [] }, { ...input, channel }),
    model_provider: 'fallback',
    model_version: 'template-v1',
    generation_method: 'template',
  };
}

/**
 * @param {{ channel?: string, product_focus?: string, audience_segment?: string, campaign_id?: string, campaign_key?: string, page_key?: string, source_context?: object }} input
 */
async function generateLandingPageVariants(input) {
  const page_key =
    input.page_key ||
    (input.product_focus ? `${String(input.product_focus).replace(/[^a-z0-9_]/gi, '_')}_landing` : 'general_landing');

  const ctx = input.source_context || {};
  const block = buildUserContextBlock(
    { ...input, channel: input.channel || 'landing' },
    {
      campaign: ctx.campaign,
      roi_summary_row: ctx.roi_summary_row,
      relevant_insights: ctx.relevant_insights,
      insights_summary: ctx.insights_summary,
    }
  );

  const signals = extractLandingSignals({ ...input, page_key, source_context: input.source_context });
  const strategyAware = hasStrategySignals(signals);
  const fallbackModelVersion = strategyAware ? 'template-strategy-v1' : 'template-v1';

  if (process.env.OPENAI_API_KEY) {
    try {
      return await generateLandingVariantsWithOpenAI({ ...input, page_key }, block);
    } catch (e) {
      console.warn('[ad-generation-engine] OpenAI landing variants failed, using template:', e.message || e);
    }
  }

  return {
    page_key,
    variants: normalizeLandingVariants({ variants: [] }, { ...input, page_key }, signals),
    model_provider: 'fallback',
    model_version: fallbackModelVersion,
    generation_method: 'template',
  };
}

/**
 * Static examples for docs/tests: mock task signals → fallback-shaped variant pair (no API).
 */
function getMockStrategyAwareLandingExamples() {
  const input = { product_focus: 'energy_advisory', audience_segment: 'homeowner' };
  const ctaSignals = {
    change_type: 'cta',
    strategy: 'strengthen_primary_cta',
    source_insight: 'weak_intent_capture',
    warnings: [],
    page_key: 'energy_landing',
    page_path: '/energy',
  };
  const qualRoiSignals = {
    change_type: 'qualification',
    strategy: 'add_disqualification_section',
    source_insight: 'wrong_audience_signal',
    warnings: ['roi_campaign_approximate: Multiple campaigns map to this page_path.'],
    page_key: 'cheap_sparky_landing',
    page_path: '/cheap-sparky',
  };
  const pairCta = buildStrategyFallbackVariantPair(input, ctaSignals);
  const pairQual = buildStrategyFallbackVariantPair(input, qualRoiSignals);
  return [
    {
      label: 'Mock task: cta / strengthen_primary_cta',
      signals: ctaSignals,
      variants: [
        { variant_label: 'A', ...pairCta.A },
        { variant_label: 'B', ...pairCta.B },
      ],
    },
    {
      label: 'Mock task: qualification + ROI attribution warning (supporting_angle note)',
      signals: qualRoiSignals,
      variants: [
        {
          variant_label: 'A',
          ...pairQual.A,
          supporting_angle: appendWarningNoteToAngle(pairQual.A.supporting_angle, qualRoiSignals.warnings),
        },
        {
          variant_label: 'B',
          ...pairQual.B,
          supporting_angle: appendWarningNoteToAngle(pairQual.B.supporting_angle, qualRoiSignals.warnings),
        },
      ],
    },
  ];
}

/**
 * Insert rows into ad_variants and landing_page_variants.
 * @param {import('pg').Pool} [db]
 */
async function persistGeneratedVariants(
  db = pool,
  {
    channel,
    product_focus,
    audience_segment,
    campaign_id,
    campaign_key,
    source_context,
    adResult,
    landingResult,
  }
) {
  const adRows = [];
  for (const v of adResult.variants) {
    const r = await db.query(
      `INSERT INTO ad_variants (
         channel, product_focus, audience_segment, campaign_id, campaign_key, source_context,
         headline, body_text, call_to_action, variant_label,
         generation_method, model_provider, model_version, status, created_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6::jsonb,
         $7, $8, $9, $10,
         $11, $12, $13, 'draft', 'ad-generation-engine'
       ) RETURNING *`,
      [
        channel,
        product_focus || null,
        audience_segment || null,
        campaign_id || null,
        campaign_key || null,
        JSON.stringify(source_context || {}),
        v.headline,
        v.body_text,
        v.call_to_action || null,
        v.variant_label || null,
        adResult.generation_method,
        adResult.model_provider || null,
        adResult.model_version || null,
      ]
    );
    adRows.push(r.rows[0]);
  }

  const lpRows = [];
  for (const v of landingResult.variants) {
    const r = await db.query(
      `INSERT INTO landing_page_variants (
         page_key, product_focus, audience_segment, campaign_id, campaign_key,
         headline, subheadline, cta_text, supporting_angle,
         generation_method, model_provider, model_version, status, source_context, created_by
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9,
         $10, $11, $12, 'draft', $13::jsonb, 'ad-generation-engine'
       ) RETURNING *`,
      [
        landingResult.page_key,
        product_focus || null,
        audience_segment || null,
        campaign_id || null,
        campaign_key || null,
        v.headline,
        v.subheadline || null,
        v.cta_text || null,
        v.supporting_angle || null,
        landingResult.generation_method,
        landingResult.model_provider || null,
        landingResult.model_version || null,
        JSON.stringify(source_context || {}),
      ]
    );
    lpRows.push(r.rows[0]);
  }

  return { ad_variants: adRows, landing_page_variants: lpRows };
}

/**
 * Full pipeline: optional campaign intel → generate → persist.
 */
async function generateAndPersist(input, db = pool) {
  const channel = String(input.channel || 'google').toLowerCase();
  if (channel !== 'google' && channel !== 'meta') {
    throw new Error('channel must be google or meta');
  }

  const campaignRef = {};
  if (input.campaign_id) campaignRef.campaign_id = input.campaign_id;
  if (input.campaign_key) campaignRef.campaign_key = input.campaign_key;

  let campaignIntel = null;
  if (campaignRef.campaign_id || campaignRef.campaign_key) {
    campaignIntel = await getGenerationInputFromCampaign(campaignRef);
  }

  const source_context = {
    request: {
      channel: input.channel,
      product_focus: input.product_focus || null,
      audience_segment: input.audience_segment || null,
      campaign_id: input.campaign_id || null,
      campaign_key: input.campaign_key || null,
      page_key: input.page_key || null,
    },
    campaign_intel: campaignIntel,
    generated_at: new Date().toISOString(),
  };

  const genInput = {
    channel,
    product_focus: input.product_focus,
    audience_segment: input.audience_segment,
    campaign_id: input.campaign_id,
    campaign_key: input.campaign_key,
    source_context: campaignIntel || {},
  };

  const adResult = await generateAdVariants(genInput);
  const landingResult = await generateLandingPageVariants({
    ...genInput,
    page_key: input.page_key,
  });

  return persistGeneratedVariants(db, {
    channel,
    product_focus: input.product_focus,
    audience_segment: input.audience_segment,
    campaign_id: input.campaign_id || null,
    campaign_key: input.campaign_key || null,
    source_context,
    adResult,
    landingResult: { ...landingResult, page_key: landingResult.page_key },
  });
}

/**
 * List variants with simple filters (read-only).
 * `channel` applies only to ad_variants; landing_page_variants has no channel column.
 */
async function listVariants(filters = {}, db = pool) {
  const limit = Math.min(Math.max(parseInt(String(filters.limit || '40'), 10) || 40, 1), 200);

  function build(table) {
    const conditions = ['1=1'];
    const params = [];
    let i = 1;
    if (table === 'ad' && filters.channel) {
      params.push(String(filters.channel));
      conditions.push(`channel = $${i++}`);
    }
    if (filters.product_focus) {
      params.push(String(filters.product_focus));
      conditions.push(`product_focus = $${i++}`);
    }
    if (filters.status) {
      params.push(String(filters.status));
      conditions.push(`status = $${i++}`);
    }
    if (filters.campaign_id) {
      params.push(String(filters.campaign_id));
      conditions.push(`campaign_id = $${i++}::uuid`);
    }
    const tbl = table === 'ad' ? 'ad_variants' : 'landing_page_variants';
    const text = `SELECT * FROM ${tbl} WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT ${limit}`;
    return { text, params };
  }

  const adQ = build('ad');
  const lpQ = build('landing');
  const [adRes, lpRes] = await Promise.all([db.query(adQ.text, adQ.params), db.query(lpQ.text, lpQ.params)]);

  return {
    ad_variants: adRes.rows,
    landing_page_variants: lpRes.rows,
  };
}

module.exports = {
  getOpenAIClient,
  getGenerationInputFromCampaign,
  generateAdVariants,
  generateLandingPageVariants,
  persistGeneratedVariants,
  generateAndPersist,
  listVariants,
  MODEL,
  extractLandingSignals,
  buildStrategyTaskDirective,
  buildWarningToneDirective,
  getMockStrategyAwareLandingExamples,
};
