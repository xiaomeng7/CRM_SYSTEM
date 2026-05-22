#!/usr/bin/env node
/**
 * PR6C recurring detection + cashflowFacts obligations.
 *
 * Usage:
 *   pnpm --filter @bht/crm run test:recurring-detection
 */

require('../lib/load-env');
const { pool } = require('../lib/db');
const { getCategoryIdByCode } = require('../services/bank/confirmCategory');
const {
  detectRecurringPatterns,
  dismissPattern,
  analyzeGroup,
} = require('../services/bank/recurringDetector');
const { collectCashflowFacts, getAdelaideYmd, addDaysYmd } = require('../services/ai-ops/cashflowFacts');

const TEST_PREFIX = 'test-recurring-detection';
const SNAPSHOT = process.env.SNAPSHOT_DATE || getAdelaideYmd();

async function cleanup() {
  await pool.query(
    `DELETE FROM bank_transactions
     WHERE import_batch_id IN (
       SELECT id FROM bank_import_batches WHERE imported_by = $1
     )`,
    [TEST_PREFIX]
  );
  await pool.query(`DELETE FROM bank_import_batches WHERE imported_by = $1`, [TEST_PREFIX]);
  await pool.query(
    `DELETE FROM recurring_patterns WHERE counterparty_key LIKE $1`,
    [`${TEST_PREFIX}%`]
  );
}

async function insertTxn(batchId, date, amount, categoryId, counterpartyKey, desc) {
  const { buildExternalHash } = require('../services/bank/parsers/base');
  const hash = buildExternalHash('anz', date, amount, desc);
  await pool.query(
    `INSERT INTO bank_transactions (
       import_batch_id, txn_date, amount, description_raw, description_norm,
       counterparty_key, direction, category_id, category_status,
       suggested_category_id, suggestion_source, suggestion_confidence,
       is_transfer, external_hash
     ) VALUES ($1,$2,$3,$4,$5,$6,'debit',$7,'confirmed',$7,'founder',1,false,$8)`,
    [batchId, date, amount, desc, desc, counterpartyKey, categoryId, hash]
  );
}

async function seedPatterns() {
  const batch = await pool.query(
    `INSERT INTO bank_import_batches (bank_profile, status, imported_by, finished_at)
     VALUES ('anz', 'completed', $1, NOW()) RETURNING id`,
    [TEST_PREFIX]
  );
  const batchId = batch.rows[0].id;
  const payrollId = await getCategoryIdByCode('payroll');
  const softwareId = await getCategoryIdByCode('software');
  const supplierId = await getCategoryIdByCode('supplier');

  const payrollCp = `${TEST_PREFIX} payroll xero`;
  const softwareCp = `${TEST_PREFIX} google workspace`;
  const supplierCp = `${TEST_PREFIX} middy electrical`;

  const payrollDates = [0, 7, 14, 21, 28].map((d) => addDaysYmd(SNAPSHOT, -28 + d));
  for (const dt of payrollDates) {
    await insertTxn(batchId, dt, -3200, payrollId, payrollCp, 'XERO PAYROLL WAGES');
  }

  const swDates = [0, 30, 60].map((d) => addDaysYmd(SNAPSHOT, -60 + d));
  for (const dt of swDates) {
    await insertTxn(batchId, dt, -32, softwareId, softwareCp, 'GOOGLE WORKSPACE');
  }

  const supDates = [0, 14, 28].map((d) => addDaysYmd(SNAPSHOT, -28 + d));
  for (const dt of supDates) {
    await insertTxn(batchId, dt, -600, supplierId, supplierCp, 'MIDDY ELECTRICAL');
  }

  return { payrollCp, softwareCp, supplierCp };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  await cleanup();
  const keys = await seedPatterns();

  const unitPayroll = analyzeGroup(
    [0, 7, 14].map((d) => ({
      txn_date: addDaysYmd(SNAPSHOT, -21 + d),
      amount: -3000,
      category_code: 'payroll',
      counterparty_key: 'u',
    }))
  );
  assert(unitPayroll && unitPayroll.cadence === 'weekly', 'Unit: weekly payroll cadence');

  const unitSw = analyzeGroup(
    [0, 30, 60].map((d) => ({
      txn_date: addDaysYmd(SNAPSHOT, -60 + d),
      amount: -30,
      category_code: 'software',
      counterparty_key: 'g',
    }))
  );
  assert(unitSw && unitSw.cadence === 'monthly', 'Unit: monthly software cadence');

  const detected = await detectRecurringPatterns({ snapshotDate: SNAPSHOT });
  assert(detected.detected >= 2, `Expected >=2 patterns, got ${detected.detected}`);

  const payrollPat = detected.patterns.find(
    (p) => p.counterparty_key === keys.payrollCp && p.category_code === 'payroll'
  );
  assert(payrollPat, 'Weekly payroll pattern detected');
  assert(payrollPat.cadence === 'weekly', 'Payroll cadence weekly');
  assert(
    payrollPat.next_expected_date === addDaysYmd(payrollPat.last_seen_date, 7),
    `next_expected_date expected last_seen+7 (${payrollPat.last_seen_date}), got ${payrollPat.next_expected_date}`
  );

  const swPat = detected.patterns.find((p) => p.category_code === 'software');
  assert(swPat && swPat.cadence === 'monthly', 'Monthly software detected');

  const beforeDismiss = await detectRecurringPatterns({ snapshotDate: SNAPSHOT });
  const supPat = beforeDismiss.patterns.find((p) => p.category_code === 'supplier');
  assert(supPat, 'Supplier recurring detected');
  await dismissPattern(supPat.id, TEST_PREFIX);

  const afterDismiss = await detectRecurringPatterns({ snapshotDate: SNAPSHOT });
  const supAgain = afterDismiss.patterns.find(
    (p) => p.counterparty_key === keys.supplierCp && p.category_code === 'supplier'
  );
  assert(!supAgain, 'Dismissed supplier must not reappear');
  assert(afterDismiss.skipped_dismissed >= 1, 'Skipped dismissed group');

  const facts = await collectCashflowFacts({ snapshotDate: SNAPSHOT });
  assert(facts.obligations, 'facts.obligations present');
  assert(
    facts.expenses.actual_from_bank != null,
    'facts.expenses.actual_from_bank when bank data exists'
  );
  assert(
    ['config', 'bank', 'hybrid'].includes(facts.expenses.source),
    'expenses.source set'
  );
  console.log('obligations.recurring_next_7d:', facts.obligations.recurring_next_7d);
  console.log('expenses.source:', facts.expenses.source);
  console.log('liquidity.actual_week_outflow:', facts.liquidity.actual_week_outflow);

  await cleanup();
  console.log('\nOK: recurring detection tests passed.');
  await pool.end();
}

main().catch(async (e) => {
  console.error(e.message || e);
  try {
    await cleanup();
    await pool.end();
  } catch (_) {}
  process.exit(1);
});
