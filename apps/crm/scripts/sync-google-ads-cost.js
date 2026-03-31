#!/usr/bin/env node
/**
 * Google Ads daily cost → campaign_costs
 *
 *   cd apps/crm && pnpm run sync:google-ads
 *   pnpm --filter @bht/crm run sync:google-ads
 *
 * Dry run: GOOGLE_ADS_SYNC_DRY_RUN=1 pnpm run sync:google-ads
 */

require('../lib/load-env');

const { syncGoogleAdsCosts, getTargetDate } = require('../services/googleAdsSync');
const { pool } = require('../lib/db');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[google-ads-sync] ERROR DATABASE_URL is required.');
    process.exit(1);
  }

  try {
    console.log('[google-ads-sync] START');
    console.log(`[google-ads-sync] date=${getTargetDate()}`);

    const summary = await syncGoogleAdsCosts();

    console.log(`[google-ads-sync] fetched=${summary.fetched_count}`);
    console.log(`[google-ads-sync] mapped=${summary.mapped_count}`);
    console.log(`[google-ads-sync] auto_created=${summary.auto_created_count ?? 0}`);
    console.log(`[google-ads-sync] created=${summary.created_count ?? 0}`);
    console.log(`[google-ads-sync] updated=${summary.updated_count ?? 0}`);
    console.log(`[google-ads-sync] skipped=${summary.skipped_count}`);
    console.log(`[google-ads-sync] dry_run=${summary.dry_run}`);
    if (summary.sync_run_id) {
      console.log(`[google-ads-sync] sync_run_id=${summary.sync_run_id}`);
    }
    if (summary.sample_skipped?.length) {
      console.log(
        '[google-ads-sync] sample_skipped=',
        JSON.stringify(summary.sample_skipped.slice(0, 5))
      );
    }
    console.log('[google-ads-sync] OK');
  } catch (e) {
    console.error('[google-ads-sync] FAIL', e.message || e);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
  process.exit(process.exitCode || 0);
}

main();
