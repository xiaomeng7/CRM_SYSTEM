#!/usr/bin/env node
/**
 * Integration checks for Cashflow Intelligence persistence.
 *
 * Usage:
 *   pnpm --filter @bht/crm run test:cashflow-intel-run
 *
 * Uses an isolated snapshot date (2099-06-03) to avoid clashing with production.
 */

require('../lib/load-env');
const { pool } = require('../lib/db');
const automationSettings = require('../services/automationSettings');
const { runCashflowIntelligence } = require('../services/ai-ops/cashflowIntelligenceAssistant');

const TEST_DATE = process.env.TEST_SNAPSHOT_DATE || '2099-06-03';

async function cleanup() {
  await pool.query(`DELETE FROM financial_snapshots WHERE snapshot_date = $1::date`, [TEST_DATE]);
  await pool.query(
    `DELETE FROM ai_operation_runs WHERE operation_type = 'cashflow_intel'
     AND details->>'snapshot_date' = $1`,
    [TEST_DATE]
  );
}

async function countSnapshots() {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM financial_snapshots WHERE snapshot_date = $1::date`,
    [TEST_DATE]
  );
  return r.rows[0].n;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function scenario(name, fn) {
  process.stdout.write(`\n--- ${name} ---\n`);
  await fn();
  console.log('OK');
}

async function main() {
  console.log('Cashflow intel integration tests (date=%s)', TEST_DATE);
  await cleanup();

  let firstSnapshotId = null;

  await scenario('1) normal run writes snapshot', async () => {
    const out = await runCashflowIntelligence({
      snapshotDate: TEST_DATE,
      force: false,
      dryRun: false,
      log: () => {},
    });
    assert(out.status === 'completed', `expected completed, got ${out.status}`);
    assert(out.snapshot_id, 'missing snapshot_id');
    assert((await countSnapshots()) === 1, 'snapshot row count');
    firstSnapshotId = out.snapshot_id;
    assert(out.insights?.recommendations?.length >= 1, 'expected recommendations');
  });

  await scenario('2) repeat run skipped', async () => {
    const out = await runCashflowIntelligence({
      snapshotDate: TEST_DATE,
      force: false,
      dryRun: false,
      log: () => {},
    });
    assert(out.status === 'skipped', `expected skipped, got ${out.status}`);
    assert(out.reason === 'snapshot_exists', `reason ${out.reason}`);
    assert(out.snapshot_id === firstSnapshotId, 'should reference existing snapshot');
    assert((await countSnapshots()) === 1, 'still one snapshot');
  });

  await scenario('3) force replaces snapshot', async () => {
    const out = await runCashflowIntelligence({
      snapshotDate: TEST_DATE,
      force: true,
      dryRun: false,
      log: () => {},
    });
    assert(out.status === 'completed', `expected completed, got ${out.status}`);
    assert(out.snapshot_id === firstSnapshotId, 'force should update same row id');
    assert((await countSnapshots()) === 1, 'still one snapshot row');
  });

  await scenario('4) disabled setting skipped', async () => {
    await automationSettings.set('cashflow_intel_enabled', false);
    try {
      const out = await runCashflowIntelligence({
        snapshotDate: '2099-06-04',
        log: () => {},
      });
      assert(out.status === 'skipped', `expected skipped, got ${out.status}`);
      assert(out.reason === 'disabled', `reason ${out.reason}`);
      const n = await pool.query(
        `SELECT COUNT(*)::int AS n FROM financial_snapshots WHERE snapshot_date = '2099-06-04'::date`
      );
      assert(n.rows[0].n === 0, 'no snapshot when disabled');
    } finally {
      await automationSettings.set('cashflow_intel_enabled', true);
    }
  });

  await scenario('5) dry-run does not write snapshot', async () => {
    await pool.query(`DELETE FROM financial_snapshots WHERE snapshot_date = '2099-06-05'::date`);
    const before = await pool.query(
      `SELECT COUNT(*)::int AS n FROM financial_snapshots WHERE snapshot_date = '2099-06-05'::date`
    );
    assert(before.rows[0].n === 0, 'precondition');

    const out = await runCashflowIntelligence({
      snapshotDate: '2099-06-05',
      dryRun: true,
      log: () => {},
    });
    assert(out.status === 'completed', `expected completed dry-run, got ${out.status}`);
    assert(out.dry_run === true, 'dry_run flag');
    assert(out.facts, 'facts present');
    assert(out.insights?.ai_summary, 'summary present');

    const after = await pool.query(
      `SELECT COUNT(*)::int AS n FROM financial_snapshots WHERE snapshot_date = '2099-06-05'::date`
    );
    assert(after.rows[0].n === 0, 'dry-run must not create snapshot');
  });

  await cleanup();
  console.log('\nAll cashflow intel run tests passed.');
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });
