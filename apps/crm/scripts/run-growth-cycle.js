#!/usr/bin/env node
/**
 * Growth Engine Orchestrator (v1) — daily-style growth loop (cron-friendly).
 *
 *   cd apps/crm && pnpm run run:growth
 *
 * Does not auto-approve plans, does not publish ads, does not call OpenClaw.
 */

require('../lib/load-env');

const { pool } = require('../lib/db');
const { syncGoogleAdsCosts } = require('../services/googleAdsSync');
const { getCampaignRoiInsights, fetchCampaignRoiRows } = require('../services/campaignRoiInsights');
const { getCampaignActionPlans } = require('../services/campaignActionPlanEngine');
const { generateAndPersist } = require('../services/adGenerationEngine');
const { enqueueApprovedVariants } = require('../services/adExecutionEngine');
const {
  insertGrowthCycleRun,
  finishGrowthCycleRun,
  deriveStatus,
} = require('../services/growthCycleSyncRun');

function log(msg) {
  console.log(`[growth-engine] ${msg}`);
}

function isProfitableForAds(row) {
  const profit = Number(row.profit || 0);
  const cr = row.conversion_rate != null ? Number(row.conversion_rate) : null;
  if (profit > 0) return true;
  if (cr != null && !Number.isNaN(cr) && cr > 0.2) return true;
  return false;
}

async function resolveChannelAndAudience(campaignId) {
  let channel = (process.env.GROWTH_DEFAULT_AD_CHANNEL || 'google').toLowerCase();
  if (channel !== 'google' && channel !== 'meta') channel = 'google';

  let product_focus = null;
  let audience_segment = null;

  if (!campaignId) {
    return { channel, product_focus, audience_segment };
  }

  try {
    const r = await pool.query(
      `SELECT platform, metadata FROM campaigns WHERE id = $1::uuid LIMIT 1`,
      [campaignId]
    );
    const c = r.rows[0];
    if (c) {
      const p = String(c.platform || '').toLowerCase();
      if (p === 'meta' || p === 'facebook') channel = 'meta';
      else if (p === 'google') channel = 'google';
      const m = c.metadata;
      if (m && typeof m === 'object' && !Array.isArray(m)) {
        if (m.product_focus != null) product_focus = String(m.product_focus).slice(0, 100) || null;
        if (m.audience_segment != null) audience_segment = String(m.audience_segment).slice(0, 100) || null;
      }
    }
  } catch (e) {
    console.warn('[growth-engine] campaign lookup skipped:', e.message || e);
  }

  return { channel, product_focus, audience_segment };
}

/**
 * Same campaign_id + channel with draft/approved rows in the last 3 days → skip new generation.
 */
async function hasRecentAdVariantsForCampaign(poolConn, campaignId, channel) {
  if (!campaignId) return false;
  try {
    const r = await poolConn.query(
      `SELECT 1 FROM ad_variants
       WHERE campaign_id = $1::uuid
         AND channel = $2
         AND status IN ('draft', 'approved')
         AND created_at >= NOW() - INTERVAL '3 days'
       LIMIT 1`,
      [campaignId, channel]
    );
    return r.rows.length > 0;
  } catch (e) {
    if (/relation .* does not exist/i.test(e.message || '')) return false;
    throw e;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[growth-engine] DATABASE_URL is required.');
    process.exit(1);
  }

  const stats = {
    step_sync_ok: false,
    step_insights_ok: false,
    step_plans_ok: false,
    step_ads_ok: false,
    step_enqueue_ok: false,
    plans_count: 0,
    ads_generated: 0,
    ads_skipped_recent: 0,
    enqueue_enqueued: 0,
    enqueue_skipped: 0,
    enqueue_errors: 0,
    fatal_error: null,
  };

  let runId = null;

  try {
    try {
      runId = await insertGrowthCycleRun(pool);
    } catch (e) {
      console.warn('[growth-engine] sync_runs insert skipped:', e.message || e);
    }

    log('START');

    try {
      await syncGoogleAdsCosts();
      stats.step_sync_ok = true;
      log('sync done');
    } catch (e) {
      console.warn('[growth-engine] sync skipped or failed:', e.message || e);
      log('sync done');
    }

    try {
      await getCampaignRoiInsights();
      stats.step_insights_ok = true;
      log('insights done');
    } catch (e) {
      console.warn('[growth-engine] insights failed:', e.message || e);
      log('insights done');
    }

    try {
      const { plans } = await getCampaignActionPlans();
      stats.plans_count = Array.isArray(plans) ? plans.length : 0;
      stats.step_plans_ok = true;
      log(`plans generated: ${stats.plans_count}`);
    } catch (e) {
      console.warn('[growth-engine] action plans failed:', e.message || e);
      log('plans generated: 0');
    }

    try {
      const rows = await fetchCampaignRoiRows();
      const targets = rows.filter(isProfitableForAds);

      for (const row of targets) {
        const campaign_id = row.campaign_id || null;
        const utm = row.utm_campaign != null ? String(row.utm_campaign).trim() : null;
        const campaign_key = utm || null;

        if (!campaign_id && !campaign_key) continue;

        const { channel, product_focus, audience_segment } = await resolveChannelAndAudience(campaign_id);

        if (campaign_id && (await hasRecentAdVariantsForCampaign(pool, campaign_id, channel))) {
          stats.ads_skipped_recent += 1;
          log('ad generation skipped: recent variants exist');
          continue;
        }

        try {
          const { ad_variants } = await generateAndPersist({
            channel,
            product_focus,
            audience_segment,
            campaign_id,
            campaign_key,
          });
          stats.ads_generated += Array.isArray(ad_variants) ? ad_variants.length : 0;
        } catch (err) {
          console.warn(
            `[growth-engine] ad generation failed for campaign_id=${campaign_id} key=${campaign_key}:`,
            err.message || err
          );
        }
      }

      stats.step_ads_ok = true;
      log(`ads generated: ${stats.ads_generated}`);
    } catch (e) {
      console.warn('[growth-engine] ad generation step failed:', e.message || e);
      log('ads generated: 0');
    }

    try {
      const enq = await enqueueApprovedVariants();
      stats.enqueue_enqueued = enq.enqueued ?? 0;
      stats.enqueue_skipped = enq.skipped ?? 0;
      stats.enqueue_errors = Array.isArray(enq.errors) ? enq.errors.length : 0;
      stats.step_enqueue_ok = true;
      log('enqueue done');
    } catch (e) {
      console.warn('[growth-engine] enqueue failed:', e.message || e);
      log('enqueue done');
    }

    log('END');
  } catch (fatal) {
    stats.fatal_error = fatal.message || String(fatal);
    throw fatal;
  } finally {
    if (runId) {
      const status = deriveStatus(stats);
      try {
        await finishGrowthCycleRun(pool, runId, {
          status,
          plans_count: stats.plans_count,
          ads_generated: stats.ads_generated,
          ads_skipped_recent: stats.ads_skipped_recent,
          enqueue_enqueued: stats.enqueue_enqueued,
          enqueue_skipped: stats.enqueue_skipped,
          enqueue_errors: stats.enqueue_errors,
          step_sync_ok: stats.step_sync_ok,
          step_insights_ok: stats.step_insights_ok,
          step_plans_ok: stats.step_plans_ok,
          step_ads_ok: stats.step_ads_ok,
          step_enqueue_ok: stats.step_enqueue_ok,
          error_message: stats.fatal_error,
        });
      } catch (e) {
        console.warn('[growth-engine] sync_runs finish failed:', e.message || e);
      }
    }
  }
}

main()
  .catch((e) => {
    console.error('[growth-engine] FATAL', e);
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));
