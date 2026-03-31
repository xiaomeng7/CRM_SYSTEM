/**
 * Landing Execution Planner (v1) — maps landingIntelligenceEngine output → executable tasks.
 *
 * Consumes structured recommendations only; does not re-analyse. Designed for growthTaskExecutor
 * (update_landing_variant) and landing_page_variants generation downstream.
 *
 * Principles embedded in mapping:
 * - Tasks are about qualification, clarity, and trust — never “maximise submits at any cost”.
 * - Page-level warnings from intelligence are always copied into payload for audit trails.
 */

/** @type {Record<string, string>} */
const RECOMMENDATION_TO_STRATEGY = {
  cta: 'strengthen_primary_cta',
  hero: 'clarify_value_proposition',
  form: 'reduce_form_friction',
  trust: 'add_trust_section',
  qualification: 'add_disqualification_section',
};

const ALLOWED_REC_TYPES = new Set(Object.keys(RECOMMENDATION_TO_STRATEGY));

const PRIORITY_RANK = { high: 3, medium: 2, low: 1 };

/**
 * Stable page_key for landing_page_variants (e.g. /energy → energy_landing).
 * @param {string} pagePath
 */
function pathToPageKey(pagePath) {
  const raw = String(pagePath || '').trim();
  if (!raw || raw === '/') {
    return 'root_landing';
  }
  const segments = raw
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) {
    return 'root_landing';
  }
  const slug = segments
    .join('_')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
  if (!slug) {
    return 'page_landing';
  }
  if (slug.endsWith('_landing')) {
    return slug;
  }
  return `${slug}_landing`;
}

function normalisePriority(p) {
  const x = String(p || '').toLowerCase();
  if (x === 'high' || x === 'medium' || x === 'low') return x;
  return 'medium';
}

/**
 * Audit string: insight types + recommendation anchor (no generic “boost conversion” wording).
 * @param {{ insights?: { type?: string }[], recommendations?: unknown[] }} page
 * @param {{ type?: string, reason?: string }} recommendation
 */
function buildSourceInsight(page, recommendation) {
  const types = (page.insights || [])
    .map((i) => (i && i.type ? String(i.type) : ''))
    .filter(Boolean);
  const head = types.length ? types.join('|') : 'no_engine_insight_type';
  const reason = recommendation && recommendation.reason ? String(recommendation.reason).slice(0, 280) : '';
  const tail = reason ? ` :: ${reason}` : '';
  return `${head}${tail}`;
}

/**
 * @param {{ landingIntelligence?: { pages?: object[] } } | { pages?: object[] }} input
 */
function planLandingExecution(input) {
  const li =
    input && typeof input === 'object' && input.landingIntelligence
      ? input.landingIntelligence
      : input;
  const pages = li && Array.isArray(li.pages) ? li.pages : [];

  /** @type {Map<string, object>} */
  const dedupe = new Map();

  for (const page of pages) {
    if (!page || typeof page !== 'object') continue;
    const page_path = page.page_path != null ? String(page.page_path) : '';
    if (!page_path) continue;

    const recs = Array.isArray(page.recommendations) ? page.recommendations : [];
    const pageWarnings = Array.isArray(page.warnings) ? [...page.warnings] : [];

    for (const rec of recs) {
      if (!rec || typeof rec !== 'object') continue;
      const recType = String(rec.type || '').toLowerCase();
      if (!ALLOWED_REC_TYPES.has(recType)) continue;

      const strategy = RECOMMENDATION_TO_STRATEGY[recType];
      const priority = normalisePriority(rec.priority);
      const page_key = pathToPageKey(page_path);
      const source_insight = buildSourceInsight(page, rec);

      const task = {
        task_type: 'update_landing_variant',
        page_path,
        priority,
        payload: {
          page_key,
          change_type: recType,
          strategy,
          source_insight,
          warnings: pageWarnings,
        },
      };

      const dedupeKey = `${page_path}\x00${recType}\x00${strategy}`;
      const existing = dedupe.get(dedupeKey);
      if (!existing) {
        dedupe.set(dedupeKey, task);
        continue;
      }
      if (PRIORITY_RANK[priority] > PRIORITY_RANK[existing.priority]) {
        existing.priority = priority;
      }
      const prev = String(existing.payload.source_insight || '');
      const next = String(source_insight || '');
      if (next && !prev.includes(next.slice(0, 40))) {
        existing.payload.source_insight = prev ? `${prev} || ${next}` : next;
      }
    }
  }

  const tasks = [...dedupe.values()].sort((a, b) => {
    const pr = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    if (pr !== 0) return pr;
    return String(a.page_path).localeCompare(String(b.page_path));
  });

  return { tasks };
}

/** Sample intelligence payloads (same shape as landingIntelligenceEngine). */
const LANDING_EXECUTION_PLANNER_MOCK_INPUTS = [
  {
    label: 'Single page, CTA + hero recommendations',
    pages: [
      {
        page_path: '/energy',
        metrics: { sessions: 1000, form_start: 5 },
        insights: [{ type: 'weak_intent_capture', message: 'Low form_start vs sessions.' }],
        recommendations: [
          {
            type: 'cta',
            reason: 'Top-of-funnel signal is cold; prioritise self-selection over volume.',
            action: 'Strengthen primary CTA and framing.',
            priority: 'high',
          },
          {
            type: 'hero',
            reason: 'Headline sets the filter for quality leads.',
            action: 'Disqualify low-fit traffic explicitly.',
            priority: 'medium',
          },
        ],
        warnings: [],
      },
    ],
  },
  {
    label: 'Nested path + qualification + warnings passthrough',
    pages: [
      {
        page_path: '/advice/snapshot',
        metrics: {},
        insights: [{ type: 'wrong_audience_signal', message: 'Low engagement and scores.' }],
        recommendations: [
          {
            type: 'qualification',
            reason: 'Funnel widened beyond advisory-fit; sharpen ICP copy.',
            action: 'Add disqualification above the fold.',
            priority: 'high',
          },
        ],
        warnings: ['roi_campaign_approximate: Multiple campaigns map to this page_path.'],
      },
    ],
  },
  {
    label: 'Trust + form (executor may run both sequentially)',
    pages: [
      {
        page_path: '/solar-advisory',
        metrics: {},
        insights: [{ type: 'mid_funnel_drop', message: 'Form abandonment.' }],
        recommendations: [
          { type: 'trust', reason: 'Trust gap near form.', action: 'Add proof.', priority: 'high' },
          { type: 'form', reason: 'Field friction.', action: 'Reduce steps.', priority: 'medium' },
        ],
        warnings: [],
      },
    ],
  },
];

/**
 * Mock: pages → planLandingExecution output (safe in plain Node; use in tests/docs).
 */
function getLandingExecutionPlannerMockExamplesPlain() {
  return LANDING_EXECUTION_PLANNER_MOCK_INPUTS.map((m) => ({
    label: m.label,
    input: { pages: m.pages },
    output: planLandingExecution({ landingIntelligence: { pages: m.pages } }),
  }));
}

/** @deprecated Use getLandingExecutionPlannerMockExamplesPlain(); kept for discoverability. */
const LANDING_EXECUTION_PLANNER_MOCK_EXAMPLES = LANDING_EXECUTION_PLANNER_MOCK_INPUTS;

module.exports = {
  planLandingExecution,
  pathToPageKey,
  RECOMMENDATION_TO_STRATEGY,
  LANDING_EXECUTION_PLANNER_MOCK_INPUTS,
  /** @deprecated alias of LANDING_EXECUTION_PLANNER_MOCK_INPUTS */
  LANDING_EXECUTION_PLANNER_MOCK_EXAMPLES: LANDING_EXECUTION_PLANNER_MOCK_INPUTS,
  getLandingExecutionPlannerMockExamplesPlain,
};
