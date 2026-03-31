/**
 * Growth Execution Planner — turns growthIntelligenceEngine output into executable tasks.
 * No analysis here; deterministic mapping from insights + recommendations to task payloads.
 *
 * Primary task_type values: generate_ad_variant | update_landing_variant | adjust_targeting | budget_adjustment
 * Exception (insight variant_backlog / R6): pause_generation — halts new generation until backlog clears.
 */

/**
 * @typedef {object} IntelligenceInput
 * @property {object[]} [insights]
 * @property {object[]} [recommendations]
 * @property {object[]} [warnings]
 */

/**
 * @typedef {object} GrowthTask
 * @property {string} task_type
 * @property {string|null} campaign_id
 * @property {'high'|'medium'|'low'} priority
 * @property {object} payload
 */

function norm(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

function utmOnlyKeyFromInsight(ins) {
  if (ins.campaign_id) return null;
  if (ins.utm_campaign && String(ins.utm_campaign).trim()) return norm(ins.utm_campaign);
  return null;
}

/**
 * R5: UTM-only contexts must not receive budget_adjustment.
 * @param {object[]} warnings
 * @param {object[]} insights
 * @returns {Set<string>}
 */
function buildUtmOnlyKeys(warnings, insights) {
  const set = new Set();
  for (const w of warnings || []) {
    if (w.code === 'utm_only_no_cost') {
      const k = w.campaign_label || w.utm_campaign;
      if (k) set.add(norm(k));
    }
  }
  for (const ins of insights || []) {
    const k = utmOnlyKeyFromInsight(ins);
    if (k) set.add(k);
  }
  return set;
}

function isBudgetBlockedForInsight(ins, utmOnlyKeys) {
  if (ins.campaign_id) {
    const u = ins.utm_campaign ? norm(ins.utm_campaign) : null;
    if (u && utmOnlyKeys.has(u)) return true;
    return false;
  }
  return true;
}

function taskDedupeKey(t) {
  const sid = t.campaign_id || '';
  const strat = t.payload && t.payload.strategy ? t.payload.strategy : '';
  const chg = t.payload && t.payload.change ? t.payload.change : '';
  const nk =
    t.payload && Array.isArray(t.payload.negative_keywords)
      ? t.payload.negative_keywords.join(',')
      : '';
  return `${t.task_type}|${sid}|${norm(t.payload && t.payload.utm_campaign)}|${strat}|${chg}|${nk}`;
}

function campaignIdsWithBudgetTask(tasks) {
  const set = new Set();
  for (const t of tasks) {
    if (t.task_type === 'budget_adjustment' && t.campaign_id) set.add(String(t.campaign_id));
  }
  return set;
}

/** R6: variant_backlog → pause new ad generation for that campaign / UTM bucket. */
function buildVariantBacklogKeys(insights) {
  const set = new Set();
  for (const ins of insights || []) {
    if (ins.type !== 'variant_backlog') continue;
    if (ins.campaign_id) set.add(`id:${String(ins.campaign_id)}`);
    else if (ins.utm_campaign && String(ins.utm_campaign).trim()) set.add(`utm:${norm(ins.utm_campaign)}`);
  }
  return set;
}

function insightContextKey(ins) {
  if (ins.campaign_id) return `id:${String(ins.campaign_id)}`;
  if (ins.utm_campaign && String(ins.utm_campaign).trim()) return `utm:${norm(ins.utm_campaign)}`;
  return null;
}

/**
 * Map intelligence insights → canonical executable tasks (R1–R4, R6).
 * @param {IntelligenceInput} intelligence
 * @param {Set<string>} utmOnlyKeys
 * @returns {GrowthTask[]}
 */
function tasksFromInsights(intelligence, utmOnlyKeys) {
  const tasks = [];
  const insights = intelligence.insights || [];
  const backlogKeys = buildVariantBacklogKeys(insights);

  for (const ins of insights) {
    const cid = ins.campaign_id != null ? String(ins.campaign_id) : null;
    const utm = ins.utm_campaign != null ? String(ins.utm_campaign).trim() : null;
    const basePayload = {
      utm_campaign: utm,
      source_insight: ins.type,
      principle: 'filter_and_qualify_not_maximise_volume',
    };
    const ctxKey = insightContextKey(ins);
    const blockNewAds = ctxKey && backlogKeys.has(ctxKey);

    if (ins.type === 'traffic_quality') {
      tasks.push({
        task_type: 'adjust_targeting',
        campaign_id: cid,
        priority: 'high',
        payload: {
          ...basePayload,
          negative_keywords: ['cheap', 'repair', 'small job'],
        },
      });
      if (!blockNewAds) {
        tasks.push({
          task_type: 'generate_ad_variant',
          campaign_id: cid,
          priority: 'high',
          payload: {
            ...basePayload,
            strategy: 'filter_low_intent',
            messaging: 'independent advisory, not repair service',
          },
        });
      }
    }

    if (ins.type === 'audience_mismatch') {
      if (!blockNewAds) {
        tasks.push({
          task_type: 'generate_ad_variant',
          campaign_id: cid,
          priority: 'high',
          payload: {
            ...basePayload,
            strategy: 'reposition_audience',
            target: 'homeowners_with_high_bills',
          },
        });
      }
    }

    if (ins.type === 'landing_proxy') {
      tasks.push({
        task_type: 'update_landing_variant',
        campaign_id: cid,
        priority: 'medium',
        payload: {
          ...basePayload,
          change: 'add_disqualification_section',
        },
      });
    }

    if (ins.type === 'scale_candidate') {
      if (!blockNewAds) {
        tasks.push({
          task_type: 'generate_ad_variant',
          campaign_id: cid,
          priority: 'medium',
          payload: {
            ...basePayload,
            strategy: 'scale_high_value',
          },
        });
      }
      if (!isBudgetBlockedForInsight(ins, utmOnlyKeys)) {
        tasks.push({
          task_type: 'budget_adjustment',
          campaign_id: cid,
          priority: 'medium',
          payload: {
            ...basePayload,
            change: '+20%',
          },
        });
      }
    }

    if (ins.type === 'variant_backlog') {
      tasks.push({
        task_type: 'pause_generation',
        campaign_id: cid,
        priority: 'low',
        payload: {
          reason: 'too many drafts',
          utm_campaign: utm,
          source_insight: 'variant_backlog',
        },
      });
    }
  }

  return tasks;
}

/**
 * Map recommendations → tasks when they add coverage (and avoid duplicating insight-driven work).
 * @param {IntelligenceInput} intelligence
 * @param {Set<string>} utmOnlyKeys
 * @param {Set<string>} seenKeys
 * @param {Set<string>} budgetCampaignIds — campaigns that already have a budget_adjustment task
 * @param {Set<string>} variantBacklogKeys — R6: suppress generate_ad_variant for these keys
 */
function tasksFromRecommendations(intelligence, utmOnlyKeys, seenKeys, budgetCampaignIds, variantBacklogKeys) {
  const tasks = [];
  const recs = intelligence.recommendations || [];

  for (const rec of recs) {
    const label = rec.campaign_label != null ? String(rec.campaign_label) : '';
    if (label === '_global') {
      tasks.push({
        task_type: 'generate_ad_variant',
        campaign_id: null,
        priority: 'low',
        payload: {
          strategy: 'reinforce_positioning',
          scope: 'global',
          reason: rec.reason || '',
          action: rec.action || '',
          principle: 'filter_and_qualify_not_maximise_volume',
        },
      });
      continue;
    }

    const cid = rec.campaign_id != null ? String(rec.campaign_id) : null;
    const utm = rec.utm_campaign != null ? String(rec.utm_campaign).trim() : null;
    const recKeyForBacklog = cid
      ? `id:${cid}`
      : utm
        ? `utm:${norm(utm)}`
        : label
          ? `utm:${norm(label)}`
          : null;
    const blockAds = recKeyForBacklog && variantBacklogKeys.has(recKeyForBacklog);
    const pr = rec.priority === 'high' || rec.priority === 'low' ? rec.priority : 'medium';

    const base = {
      utm_campaign: utm,
      campaign_label: label || null,
      source_recommendation_type: rec.type,
      reason: rec.reason || '',
      action: rec.action || '',
      principle: 'filter_and_qualify_not_maximise_volume',
    };

    if (rec.type === 'targeting') {
      const t = {
        task_type: 'adjust_targeting',
        campaign_id: cid,
        priority: pr,
        payload: {
          ...base,
          negative_keywords: ['cheap', 'repair', 'small job', 'emergency', 'urgent fix'],
        },
      };
      const k = taskDedupeKey(t);
      if (!seenKeys.has(k)) {
        seenKeys.add(k);
        tasks.push(t);
      }
    } else if (rec.type === 'landing') {
      const t = {
        task_type: 'update_landing_variant',
        campaign_id: cid,
        priority: pr,
        payload: {
          ...base,
          change: 'add_disqualification_section',
        },
      };
      const k = taskDedupeKey(t);
      if (!seenKeys.has(k)) {
        seenKeys.add(k);
        tasks.push(t);
      }
    } else if (rec.type === 'ad_copy') {
      if (blockAds) continue;
      const t = {
        task_type: 'generate_ad_variant',
        campaign_id: cid,
        priority: pr,
        payload: {
          ...base,
          strategy: 'apply_intelligence_action',
          messaging: 'independent advisory; exclude low-value repair and price-only intent',
        },
      };
      const k = taskDedupeKey(t);
      if (!seenKeys.has(k)) {
        seenKeys.add(k);
        tasks.push(t);
      }
    } else if (rec.type === 'budget') {
      if (!cid && utm && utmOnlyKeys.has(norm(utm))) continue;
      if (!cid) continue;
      if (budgetCampaignIds.has(cid)) continue;
      const t = {
        task_type: 'budget_adjustment',
        campaign_id: cid,
        priority: pr,
        payload: {
          ...base,
          change: '+10%',
        },
      };
      const k = taskDedupeKey(t);
      if (!seenKeys.has(k)) {
        seenKeys.add(k);
        budgetCampaignIds.add(cid);
        tasks.push(t);
      }
    }
  }

  return tasks;
}

/**
 * @param {{ intelligence: IntelligenceInput }} input
 * @returns {{ tasks: GrowthTask[] }}
 */
function planGrowthExecution(input) {
  const intelligence = input && input.intelligence ? input.intelligence : {};
  const utmOnlyKeys = buildUtmOnlyKeys(intelligence.warnings || [], intelligence.insights || []);

  const seen = new Set();
  const fromInsights = tasksFromInsights(intelligence, utmOnlyKeys);
  for (const t of fromInsights) {
    seen.add(taskDedupeKey(t));
  }

  const budgetCampaignIds = campaignIdsWithBudgetTask(fromInsights);
  const variantBacklogKeys = buildVariantBacklogKeys(intelligence.insights || []);
  const fromRecs = tasksFromRecommendations(
    intelligence,
    utmOnlyKeys,
    seen,
    budgetCampaignIds,
    variantBacklogKeys
  );
  const tasks = [...fromInsights, ...fromRecs];

  tasks.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.priority] ?? 1) - (order[b.priority] ?? 1);
  });

  return { tasks };
}

/** Mock scenarios: intelligence snapshot → planner output (for docs / tests). */
function getMockPlannerExamples() {
  return [
    {
      name: 'R1 traffic_quality + R3 audience_mismatch (same campaign)',
      input: {
        intelligence: {
          insights: [
            {
              type: 'traffic_quality',
              campaign_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
              utm_campaign: 'google_search_nonbrand',
              message: 'high volume weak revenue',
            },
            {
              type: 'audience_mismatch',
              campaign_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
              utm_campaign: 'google_search_nonbrand',
              message: 'low high-score share',
            },
          ],
          recommendations: [],
          warnings: [],
        },
      },
      output: planGrowthExecution({
        intelligence: {
          insights: [
            {
              type: 'traffic_quality',
              campaign_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
              utm_campaign: 'google_search_nonbrand',
              message: 'high volume weak revenue',
            },
            {
              type: 'audience_mismatch',
              campaign_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
              utm_campaign: 'google_search_nonbrand',
              message: 'low high-score share',
            },
          ],
          recommendations: [],
          warnings: [],
        },
      }),
    },
    {
      name: 'R2 scale_candidate with budget (has campaign_id)',
      input: {
        intelligence: {
          insights: [
            {
              type: 'scale_candidate',
              campaign_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
              utm_campaign: 'energy_advisory_search',
              message: 'strong RPL',
            },
          ],
          recommendations: [],
          warnings: [],
        },
      },
      output: planGrowthExecution({
        intelligence: {
          insights: [
            {
              type: 'scale_candidate',
              campaign_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
              utm_campaign: 'energy_advisory_search',
              message: 'strong RPL',
            },
          ],
          recommendations: [],
          warnings: [],
        },
      }),
    },
    {
      name: 'R2 UTM-only: no budget task (R5) + R4 landing + R6 backlog',
      input: {
        intelligence: {
          insights: [
            {
              type: 'scale_candidate',
              campaign_id: null,
              utm_campaign: 'generic_electrician',
              message: 'looks good but no id',
            },
            { type: 'landing_proxy', campaign_id: null, utm_campaign: 'generic_electrician', message: 'weak conv' },
            {
              type: 'variant_backlog',
              campaign_id: null,
              utm_campaign: 'generic_electrician',
              message: 'drafts piling up',
            },
          ],
          recommendations: [],
          warnings: [
            {
              code: 'utm_only_no_cost',
              campaign_label: 'generic_electrician',
              message: 'no cost join',
            },
          ],
        },
      },
      output: planGrowthExecution({
        intelligence: {
          insights: [
            {
              type: 'scale_candidate',
              campaign_id: null,
              utm_campaign: 'generic_electrician',
              message: 'looks good but no id',
            },
            { type: 'landing_proxy', campaign_id: null, utm_campaign: 'generic_electrician', message: 'weak conv' },
            {
              type: 'variant_backlog',
              campaign_id: null,
              utm_campaign: 'generic_electrician',
              message: 'drafts piling up',
            },
          ],
          recommendations: [],
          warnings: [
            {
              code: 'utm_only_no_cost',
              campaign_label: 'generic_electrician',
              message: 'no cost join',
            },
          ],
        },
      }),
    },
  ];
}

module.exports = {
  planGrowthExecution,
  getMockPlannerExamples,
  buildUtmOnlyKeys,
  tasksFromInsights,
};
