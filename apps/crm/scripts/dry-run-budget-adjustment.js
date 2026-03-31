#!/usr/bin/env node
/**
 * Force dry-run budget_adjustment against real DB + Google Ads API (no budget mutate).
 *
 * Verifies:
 *   1) campaigns.google_campaign_id matches expectation
 *   2) Google Ads API returns current campaign budget
 *   3) new_budget_micros matches ceil(current * (1 ± pct/100))
 *   4) execution_mode === dry_run
 *
 * Usage (from apps/crm):
 *   GOOGLE_ADS_PUBLISH_DRY_RUN=1 pnpm exec node scripts/dry-run-budget-adjustment.js <campaign_uuid> [change]
 *   # or env:
 *   BUDGET_DRY_RUN_CAMPAIGN_ID=<uuid> BUDGET_DRY_RUN_CHANGE=+10% pnpm exec node scripts/dry-run-budget-adjustment.js
 *
 * This script ALWAYS sets GOOGLE_ADS_PUBLISH_DRY_RUN=1 so mutate is never sent.
 */

require('../lib/load-env');

const { pool } = require('../lib/db');
const { publishBudgetAdjustment, parseBudgetChange } = require('../services/googleAdsBudgetPublisher');

async function main() {
  process.env.GOOGLE_ADS_PUBLISH_DRY_RUN = '1';

  const campaignId =
    process.argv[2] ||
    (process.env.BUDGET_DRY_RUN_CAMPAIGN_ID && String(process.env.BUDGET_DRY_RUN_CAMPAIGN_ID).trim()) ||
    '';
  const changeRaw =
    process.argv[3] ||
    (process.env.BUDGET_DRY_RUN_CHANGE && String(process.env.BUDGET_DRY_RUN_CHANGE).trim()) ||
    '+10%';

  if (!campaignId || !/^[0-9a-f-]{36}$/i.test(campaignId)) {
    console.error(
      'Usage: node scripts/dry-run-budget-adjustment.js <campaigns.id UUID> [change]\n' +
        '   or: BUDGET_DRY_RUN_CAMPAIGN_ID=<uuid> BUDGET_DRY_RUN_CHANGE=+10% ...\n' +
        'Requires DATABASE_URL + full Google Ads env for API read.'
    );
    process.exitCode = 1;
    return;
  }

  console.log('\n=== Budget dry-run checklist ===\n');
  console.log('campaign_id (local):', campaignId);
  console.log('payload.change:     ', changeRaw);
  console.log('GOOGLE_ADS_PUBLISH_DRY_RUN forced to 1 (no mutate)\n');

  const cr = await pool.query(
    `SELECT id, code, name, google_campaign_id FROM campaigns WHERE id = $1::uuid LIMIT 1`,
    [campaignId]
  );
  const row = cr.rows[0];
  if (!row) {
    console.error('❌ [1] No campaign row for this id.');
    process.exitCode = 1;
    await pool.end().catch(() => {});
    return;
  }

  const gcid = row.google_campaign_id != null ? String(row.google_campaign_id).trim() : '';
  console.log('[1] DB campaigns.google_campaign_id');
  console.log('    code:', row.code || '(null)', '| name:', (row.name || '').slice(0, 80));
  console.log('    google_campaign_id:', gcid || '(MISSING — resolve will fail)');
  if (!gcid) {
    console.error('\n❌ Stop: set google_campaign_id on this campaign before continuing.');
    process.exitCode = 1;
    await pool.end().catch(() => {});
    return;
  }
  console.log('    ✓ looks present\n');

  const task = {
    task_type: 'budget_adjustment',
    campaign_id: campaignId,
    priority: 'medium',
    payload: {
      change: changeRaw,
      source_insight: 'dry_run_script',
    },
  };

  const parsed = parseBudgetChange(changeRaw);
  const factor = parsed.direction === 'increase' ? 1 + parsed.percent / 100 : 1 - parsed.percent / 100;

  const result = await publishBudgetAdjustment({ task, db: pool });

  console.log('Raw API result:\n', JSON.stringify(result, null, 2), '\n');

  const r = result.result || {};
  const cur = r.current_budget_micros;
  const neu = r.new_budget_micros;

  let ok2 = result.ok && cur != null && Number.isFinite(Number(cur)) && Number(cur) > 0;
  console.log('[2] Google Ads current budget (search API)');
  if (ok2) {
    console.log('    current_budget_micros:', cur, '✓');
  } else {
    console.log('    ❌ not available —', result.error || result.details || 'see above');
  }
  console.log('');

  let ok3 = false;
  if (ok2 && neu != null) {
    const expected = Math.ceil(Number(cur) * factor);
    ok3 = Number(neu) === expected;
    console.log('[3] new_budget_micros vs manual formula');
    console.log('    direction:', parsed.direction, '| percent:', parsed.percent);
    console.log('    ceil(current * factor):', expected);
    console.log('    returned new_budget_micros:', neu, ok3 ? '✓' : '❌ MISMATCH');
  } else {
    console.log('[3] skip (no current budget)');
  }
  console.log('');

  const ok4 = result.execution_mode === 'dry_run' && result.ok === true;
  console.log('[4] execution_mode dry_run + ok');
  console.log('    execution_mode:', result.execution_mode, '| ok:', result.ok, ok4 ? '✓' : '❌');
  console.log('');

  console.log(
    'sync_runs: latest budget log → SELECT id, status, dry_run, summary, finished_at FROM sync_runs WHERE sync_type = \'growth_budget_publisher\' ORDER BY finished_at DESC NULLS LAST LIMIT 3;'
  );

  if (!(ok2 && ok3 && ok4)) {
    process.exitCode = 1;
  }

  await pool.end().catch(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
  pool.end().catch(() => {});
});
