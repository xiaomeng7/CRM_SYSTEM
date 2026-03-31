/**
 * Growth Task Executor v1 — runs growthExecutionPlanner tasks (no queue, no OpenClaw).
 * Does not modify Planner or growthIntelligenceEngine.
 */

const { pool } = require('../lib/db');
const {
  getGenerationInputFromCampaign,
  generateAdVariants,
  generateLandingPageVariants,
  persistGeneratedVariants,
} = require('./adGenerationEngine');
const { publishBudgetAdjustment } = require('./googleAdsBudgetPublisher');
const { publishTargetingAdjustment } = require('./googleAdsTargetingPublisher');

const EMPTY_AD_RESULT = {
  variants: [],
  generation_method: 'none',
  model_provider: null,
  model_version: null,
};

const EMPTY_LANDING_RESULT = {
  variants: [],
  page_key: '_growth_executor_placeholder',
  generation_method: 'none',
  model_provider: null,
  model_version: null,
};

/**
 * Map planner strategies → generation hints (advisory positioning, not job-shop).
 * @param {object} payload
 * @returns {{ product_focus: string|null, audience_segment: string|null }}
 */
function inferProductAudienceFromPayload(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const strategy = String(p.strategy || '').toLowerCase();
  const target = String(p.target || '').toLowerCase();

  if (strategy === 'filter_low_intent') {
    return { product_focus: 'energy_advisory', audience_segment: 'homeowner' };
  }
  if (strategy === 'reposition_audience' || target.includes('homeowner') || target.includes('high_bill')) {
    return { product_focus: 'energy_advisory', audience_segment: 'homeowner' };
  }
  if (strategy === 'scale_high_value') {
    return { product_focus: 'energy_advisory', audience_segment: 'investor' };
  }
  if (strategy === 'reinforce_positioning') {
    return { product_focus: 'energy_advisory', audience_segment: 'investor' };
  }
  if (strategy === 'apply_intelligence_action') {
    return { product_focus: 'energy_advisory', audience_segment: 'homeowner' };
  }
  return { product_focus: 'energy_advisory', audience_segment: 'homeowner' };
}

function resolveCampaignKey(task, payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  if (p.campaign_key != null && String(p.campaign_key).trim()) return String(p.campaign_key).trim();
  if (p.utm_campaign != null && String(p.utm_campaign).trim()) return String(p.utm_campaign).trim();
  return null;
}

function buildSourceContext(task, campaignIntel) {
  const base = campaignIntel && typeof campaignIntel === 'object' ? { ...campaignIntel } : {};
  return {
    ...base,
    growth_task_executor: {
      task_type: task.task_type,
      priority: task.priority,
      campaign_id: task.campaign_id,
      payload: task.payload || {},
      executed_at: new Date().toISOString(),
    },
  };
}

async function handleBudgetAdjustment(task, db) {
  return publishBudgetAdjustment({ task, db });
}

async function handleAdjustTargeting(task, db) {
  return publishTargetingAdjustment({ task, db });
}

async function handleGenerateAdVariant(task, db) {
  const payload = task.payload || {};
  const campaign_id = task.campaign_id || null;
  const campaign_key = resolveCampaignKey(task, payload);

  const campaignRef = {};
  if (campaign_id) campaignRef.campaign_id = campaign_id;
  if (campaign_key) campaignRef.campaign_key = campaign_key;

  let campaignIntel = null;
  if (campaignRef.campaign_id || campaignRef.campaign_key) {
    try {
      campaignIntel = await getGenerationInputFromCampaign(campaignRef);
    } catch (e) {
      console.warn('[growth-task-executor] getGenerationInputFromCampaign:', e.message || e);
    }
  }

  const { product_focus, audience_segment } = inferProductAudienceFromPayload(payload);
  const source_context = buildSourceContext(task, campaignIntel);

  const genInput = {
    channel: 'google',
    product_focus,
    audience_segment,
    campaign_id,
    campaign_key,
    source_context,
  };

  const adResult = await generateAdVariants(genInput);
  const persisted = await persistGeneratedVariants(db, {
    channel: 'google',
    product_focus,
    audience_segment,
    campaign_id,
    campaign_key,
    source_context,
    adResult,
    landingResult: { ...EMPTY_LANDING_RESULT, page_key: '_growth_executor_no_landing' },
  });

  const created_ids = (persisted.ad_variants || []).map((r) => r.id).filter(Boolean);
  return {
    ok: true,
    task_type: 'generate_ad_variant',
    execution_mode: 'draft_only',
    count: created_ids.length,
    created_ids,
    generation_method: adResult.generation_method,
    model_provider: adResult.model_provider || null,
  };
}

async function handleUpdateLandingVariant(task, db) {
  const payload = task.payload || {};
  const campaign_id = task.campaign_id || null;
  const campaign_key = resolveCampaignKey(task, payload);

  const campaignRef = {};
  if (campaign_id) campaignRef.campaign_id = campaign_id;
  if (campaign_key) campaignRef.campaign_key = campaign_key;

  let campaignIntel = null;
  if (campaignRef.campaign_id || campaignRef.campaign_key) {
    try {
      campaignIntel = await getGenerationInputFromCampaign(campaignRef);
    } catch (e) {
      console.warn('[growth-task-executor] getGenerationInputFromCampaign:', e.message || e);
    }
  }

  const { product_focus, audience_segment } = inferProductAudienceFromPayload(payload);
  const source_context = {
    ...buildSourceContext(task, campaignIntel),
    landing_generation_signals: {
      page_path: task.page_path != null ? String(task.page_path) : payload.page_path != null ? String(payload.page_path) : null,
      page_key: payload.page_key != null ? String(payload.page_key) : null,
      change_type: payload.change_type != null ? String(payload.change_type) : null,
      strategy: payload.strategy != null ? String(payload.strategy) : null,
      source_insight: payload.source_insight != null ? String(payload.source_insight) : null,
      warnings: Array.isArray(payload.warnings) ? [...payload.warnings] : [],
    },
  };

  const page_key =
    payload.page_key ||
    (product_focus ? `${String(product_focus).replace(/[^a-z0-9_]/gi, '_')}_landing` : 'general_landing');

  const genInput = {
    channel: 'landing',
    product_focus,
    audience_segment,
    campaign_id,
    campaign_key,
    page_key,
    page_path: task.page_path != null ? String(task.page_path) : payload.page_path != null ? String(payload.page_path) : null,
    source_context,
  };

  const landingResult = await generateLandingPageVariants(genInput);
  const lr = {
    ...landingResult,
    page_key: landingResult.page_key || page_key,
  };

  const persisted = await persistGeneratedVariants(db, {
    channel: 'google',
    product_focus,
    audience_segment,
    campaign_id,
    campaign_key,
    source_context,
    adResult: EMPTY_AD_RESULT,
    landingResult: lr,
  });

  const created_ids = (persisted.landing_page_variants || []).map((r) => r.id).filter(Boolean);
  return {
    ok: true,
    task_type: 'update_landing_variant',
    execution_mode: 'draft_only',
    count: created_ids.length,
    created_ids,
    page_key: lr.page_key,
    change: payload.change || null,
    generation_method: landingResult.generation_method,
    model_provider: landingResult.model_provider || null,
  };
}

function handlePauseGeneration(task) {
  const payload = task.payload || {};
  const reason = payload.reason != null ? String(payload.reason) : 'unknown';
  const key =
    task.campaign_id ||
    payload.utm_campaign ||
    payload.campaign_label ||
    '(no campaign key)';
  console.warn(
    `[growth-task-executor] pause_generation: campaign_key=${key} reason=${reason} — defer new ad generation until draft backlog is cleared.`
  );
  return {
    ok: true,
    task_type: 'pause_generation',
    execution_mode: 'policy_only',
    result: { paused: true, reason },
  };
}

/**
 * @param {{ task: object, db?: import('pg').Pool }} opts
 */
async function executeGrowthTask(opts) {
  const task = opts && opts.task ? opts.task : null;
  const db = opts && opts.db ? opts.db : pool;

  if (!task || typeof task !== 'object') {
    return {
      ok: false,
      task_type: null,
      execution_mode: 'error',
      error: 'invalid_task',
    };
  }

  const task_type = String(task.task_type || '').trim();

  try {
    switch (task_type) {
      case 'budget_adjustment':
        return await handleBudgetAdjustment(task, db);
      case 'adjust_targeting':
        return await handleAdjustTargeting(task, db);
      case 'generate_ad_variant':
        return await handleGenerateAdVariant(task, db);
      case 'update_landing_variant':
        return await handleUpdateLandingVariant(task, db);
      case 'pause_generation':
        return handlePauseGeneration(task);
      default:
        return {
          ok: false,
          task_type: task_type || 'unknown',
          execution_mode: 'unsupported',
          error: 'unknown_task_type',
        };
    }
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    console.warn('[growth-task-executor]', task_type, msg);
    return {
      ok: false,
      task_type: task_type || 'unknown',
      execution_mode: 'error',
      error: msg,
    };
  }
}

/**
 * Sequential execution; one failure does not stop the rest.
 * @param {{ tasks: object[], db?: import('pg').Pool }} opts
 */
async function executeGrowthTasks(opts) {
  const tasks = opts && Array.isArray(opts.tasks) ? opts.tasks : [];
  const db = opts && opts.db ? opts.db : pool;
  const results = [];

  for (const task of tasks) {
    const r = await executeGrowthTask({ task, db });
    results.push(r);
  }

  return { ok: true, results };
}

/**
 * Static example for docs (no DB).
 */
function getMockExecutionResultsExample() {
  return {
    ok: true,
    results: [
      {
        ok: true,
        task_type: 'budget_adjustment',
        execution_mode: 'dry_run',
        result: {
          google_campaign_id: '12345678901',
          current_budget_micros: 10000000,
          new_budget_micros: 12000000,
          percent_change: 20,
          campaign_budget_resource_name: 'customers/1234567890/campaignBudgets/9876543210',
        },
      },
      {
        ok: true,
        task_type: 'adjust_targeting',
        execution_mode: 'dry_run',
        result: {
          google_campaign_id: '12345678901',
          requested_negative_keywords: ['cheap', 'repair', 'small job'],
          existing_negative_keywords: ['cheap'],
          added_negative_keywords: ['repair', 'small job'],
        },
      },
      {
        ok: true,
        task_type: 'generate_ad_variant',
        execution_mode: 'draft_only',
        count: 3,
        created_ids: ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'],
        generation_method: 'template',
        model_provider: 'fallback',
      },
      {
        ok: true,
        task_type: 'pause_generation',
        execution_mode: 'policy_only',
        result: { paused: true, reason: 'too many drafts' },
      },
    ],
  };
}

module.exports = {
  executeGrowthTask,
  executeGrowthTasks,
  getMockExecutionResultsExample,
  inferProductAudienceFromPayload,
};
