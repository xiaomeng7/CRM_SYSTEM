#!/usr/bin/env node
/**
 * GA4 daily page + key events → ga4_page_metrics_daily / ga4_event_metrics_daily
 *
 *   cd apps/crm && pnpm run sync:ga4
 *   pnpm --filter @bht/crm run sync:ga4
 *
 * Dry run (fetch only, no DB writes): GA4_SYNC_DRY_RUN=1 pnpm run sync:ga4
 */

require('../lib/load-env');

const { syncGa4Behavior, getTargetDate } = require('../services/ga4Sync');
const { pool } = require('../lib/db');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[ga4-sync] ERROR DATABASE_URL is required.');
    process.exit(1);
  }

  try {
    const date = getTargetDate();
    console.log(`[ga4-sync] START date=${date}`);

    const summary = await syncGa4Behavior();

    console.log(`[ga4-sync] page_rows=${summary.page_rows}`);
    console.log(`[ga4-sync] event_rows=${summary.event_rows}`);
    console.log(`[ga4-sync] page_created=${summary.page_created}`);
    console.log(`[ga4-sync] page_updated=${summary.page_updated}`);
    console.log(`[ga4-sync] event_created=${summary.event_created}`);
    console.log(`[ga4-sync] event_updated=${summary.event_updated}`);
    console.log(`[ga4-sync] dry_run=${summary.dry_run}`);
    if (summary.sync_run_id) {
      console.log(`[ga4-sync] sync_run_id=${summary.sync_run_id}`);
    }
    console.log('[ga4-sync] OK');
  } catch (e) {
    console.error('[ga4-sync] FAIL', e.message || e);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
  process.exit(process.exitCode || 0);
}

main();
