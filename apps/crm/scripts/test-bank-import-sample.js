#!/usr/bin/env node
/**
 * Bank CSV import sample test (PR6A).
 * Uses fixture only in memory — never writes raw CSV to disk or DB.
 *
 * Usage:
 *   pnpm --filter @bht/crm run test:bank-import-sample
 */

require('../lib/load-env');
const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');
const { importBankCsv } = require('../services/bank/importBankCsv');

const FIXTURE = path.join(__dirname, '../fixtures/bank/anz-sample.csv');
const TEST_IMPORTED_BY = 'test-bank-import-sample';

async function cleanupTestImports() {
  await pool.query(
    `DELETE FROM bank_transactions
     WHERE import_batch_id IN (
       SELECT id FROM bank_import_batches WHERE imported_by = $1
     )`,
    [TEST_IMPORTED_BY]
  );
  await pool.query(`DELETE FROM bank_import_batches WHERE imported_by = $1`, [
    TEST_IMPORTED_BY,
  ]);
}

async function main() {
  const csvText = fs.readFileSync(FIXTURE, 'utf8');
  if (!csvText.trim()) throw new Error('Fixture empty');

  await cleanupTestImports();

  const first = await importBankCsv({
    csvText,
    bankProfile: 'anz',
    fileName: 'anz-sample.csv',
    importedBy: TEST_IMPORTED_BY,
  });

  console.log('\n=== First import ===');
  console.log(JSON.stringify(first, null, 2));

  if (first.imported <= 0) {
    throw new Error(`Expected imported > 0, got ${first.imported}`);
  }

  const second = await importBankCsv({
    csvText,
    bankProfile: 'anz',
    fileName: 'anz-sample.csv',
    importedBy: TEST_IMPORTED_BY,
  });

  console.log('\n=== Second import (dedupe) ===');
  console.log(JSON.stringify(second, null, 2));

  if (second.skipped <= 0) {
    throw new Error(`Expected skipped > 0, got ${second.skipped}`);
  }

  const txns = await pool.query(
    `SELECT t.description_norm, t.amount, t.category_status,
            t.suggestion_source, sc.code AS suggested_category
     FROM bank_transactions t
     LEFT JOIN transaction_categories sc ON sc.id = t.suggested_category_id
     WHERE t.import_batch_id = $1
     ORDER BY t.txn_date`,
    [first.batch_id]
  );

  console.log('\n=== Transactions (category suggestions) ===');
  for (const row of txns.rows) {
    console.log(
      `${row.description_norm?.slice(0, 40) || '—'} | ${row.amount} | ` +
        `${row.suggested_category} (${row.suggestion_source}, ${row.category_status})`
    );
  }

  const withRules = txns.rows.filter(
    (r) => r.suggestion_source === 'rule' && r.suggested_category !== 'unknown'
  );
  if (!withRules.length) {
    throw new Error('Expected at least one rule-based category suggestion');
  }

  const memCheck = await pool.query(
    `SELECT COUNT(*)::int AS n FROM bank_import_batches WHERE imported_by = $1`,
    [TEST_IMPORTED_BY]
  );
  console.log('\nBatches for test user:', memCheck.rows[0].n, '(expect 2)');

  console.log('\nOK: bank import sample test passed.');
  await pool.end();
}

main().catch(async (e) => {
  console.error(e.message || e);
  try {
    await pool.end();
  } catch (_) {}
  process.exit(1);
});
