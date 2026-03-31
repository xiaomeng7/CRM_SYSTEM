/**
 * Run Revenue OS SQL migrations against DATABASE_URL (additive, idempotent files).
 *
 * Default: 028 + 030 only (structure / views).
 * With --with-backfill: also runs 029 + 031 (data backfills).
 *
 * Usage (from repo root):
 *   node apps/crm/scripts/run-revenue-os-migrations.js
 *   node apps/crm/scripts/run-revenue-os-migrations.js --with-backfill
 * Or from apps/crm:
 *   node scripts/run-revenue-os-migrations.js
 *   node scripts/run-revenue-os-migrations.js --with-backfill
 *
 * Requires .env with DATABASE_URL (see apps/crm/lib/load-env).
 */

const path = require('path');
const fs = require('fs');

require('../lib/load-env');

const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Missing DATABASE_URL. Set it in .env or the environment.');
  process.exit(1);
}

const withBackfill = process.argv.includes('--with-backfill');

const FILES_DEFAULT = [
  '028_revenue_os_phase1_model_upgrade.sql',
  '030_revenue_os_stage1_consolidation.sql',
  '033_campaign_roi_tracking.sql',
  '034_campaign_roi_metrics_and_seeds.sql',
  '035_campaign_action_plan_executions.sql',
  '036_campaign_action_plan_review.sql',
  '037_campaign_action_plan_details.sql',
  '038_campaign_costs_unique_campaign_date.sql',
];

const FILES_WITH_BACKFILL = [
  '028_revenue_os_phase1_model_upgrade.sql',
  '029_revenue_os_phase1_backfill.sql',
  '030_revenue_os_stage1_consolidation.sql',
  '031_revenue_os_stage1_backfill.sql',
  '033_campaign_roi_tracking.sql',
  '034_campaign_roi_metrics_and_seeds.sql',
  '035_campaign_action_plan_executions.sql',
  '036_campaign_action_plan_review.sql',
  '037_campaign_action_plan_details.sql',
  '038_campaign_costs_unique_campaign_date.sql',
];

const files = withBackfill ? FILES_WITH_BACKFILL : FILES_DEFAULT;

const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function runFile(filename) {
  const sqlPath = path.join(__dirname, '../database', filename);
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log(`[START] ${filename}`);
  try {
    await pool.query(sql);
    console.log(`[OK]    ${filename}`);
  } catch (err) {
    console.error(`[FAIL]  ${filename}`);
    console.error(err.message || err);
    throw err;
  }
}

async function main() {
  console.log(
    withBackfill
      ? 'Revenue OS migrations: 028, 029, 030, 031 (--with-backfill)'
      : 'Revenue OS migrations: 028, 030 (default; use --with-backfill for 029+031)'
  );
  try {
    for (const f of files) {
      await runFile(f);
    }
    console.log('Revenue OS migrations completed.');
  } catch (_err) {
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
