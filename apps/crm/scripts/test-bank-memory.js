#!/usr/bin/env node
/**
 * PR6B: category confirmation + operational memory.
 *
 * Usage:
 *   pnpm --filter @bht/crm run test:bank-memory
 */

require('../lib/load-env');
const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');
const { importBankCsv } = require('../services/bank/importBankCsv');
const { parseAnzCsv } = require('../services/bank/parsers/anz');
const { buildExternalHash } = require('../services/bank/parsers/base');
const {
  confirmTransactionCategory,
  bulkConfirmByCounterparty,
  upsertCategoryMemory,
  getCategoryIdByCode,
} = require('../services/bank/confirmCategory');
const { buildCounterpartyKey } = require('../services/bank/counterpartyKey');

const FIXTURE = path.join(__dirname, '../fixtures/bank/anz-sample.csv');
const TEST_IMPORTED_BY = 'test-bank-memory';

async function deleteFixtureTransactions() {
  const parsed = parseAnzCsv(fs.readFileSync(FIXTURE, 'utf8'));
  for (const txn of parsed.transactions || []) {
    const hash = buildExternalHash(
      'anz',
      txn.txn_date,
      txn.amount,
      txn.description_norm || ''
    );
    await pool.query(`DELETE FROM bank_transactions WHERE external_hash = $1`, [hash]);
  }
}

async function cleanup() {
  await deleteFixtureTransactions();
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
  const middyKey = buildCounterpartyKey('MIDDY ELECTRICAL WHOLESALE');
  const bpKey = buildCounterpartyKey('BP FUEL CARD MARION');
  await pool.query(
    `DELETE FROM transaction_category_memory WHERE counterparty_key = ANY($1::text[])`,
    [[middyKey, bpKey]]
  );
}

async function findSuggestedByDesc(fragment) {
  const r = await pool.query(
    `SELECT t.id, t.counterparty_key, t.category_status, sc.code AS suggested
     FROM bank_transactions t
     LEFT JOIN transaction_categories sc ON sc.id = t.suggested_category_id
     JOIN bank_import_batches b ON b.id = t.import_batch_id
     WHERE b.imported_by = $1 AND t.description_norm ILIKE $2
     LIMIT 1`,
    [TEST_IMPORTED_BY, `%${fragment}%`]
  );
  return r.rows[0];
}

async function main() {
  const csvText = fs.readFileSync(FIXTURE, 'utf8');
  await cleanup();

  const imp1 = await importBankCsv({
    csvText,
    bankProfile: 'anz',
    fileName: 'anz-sample.csv',
    importedBy: TEST_IMPORTED_BY,
  });
  if (imp1.imported <= 0) throw new Error('First import expected rows');

  const middy = await findSuggestedByDesc('MIDDY');
  if (!middy || middy.category_status !== 'suggested') {
    throw new Error('MIDDY row should be suggested before confirm');
  }

  const confirm1 = await confirmTransactionCategory(middy.id, {
    categoryCode: 'supplier',
    remember: true,
    confirmedBy: 'test-bank-memory',
  });
  if (confirm1.transaction.category_status !== 'confirmed') {
    throw new Error('Expected confirmed after PUT');
  }

  const mem1 = await pool.query(
    `SELECT hit_count, category_id FROM transaction_category_memory WHERE counterparty_key = $1`,
    [middy.counterparty_key]
  );
  if (!mem1.rows[0] || mem1.rows[0].hit_count !== 1) {
    throw new Error(`Expected memory hit_count=1, got ${mem1.rows[0]?.hit_count}`);
  }
  console.log('OK: confirm + memory upsert (hit_count=1)');

  const supplierId = await getCategoryIdByCode('supplier');
  await upsertCategoryMemory({
    counterpartyKey: middy.counterparty_key,
    categoryId: supplierId,
    confirmedBy: 'test-bank-memory',
  });
  const mem2 = await pool.query(
    `SELECT hit_count FROM transaction_category_memory WHERE counterparty_key = $1`,
    [middy.counterparty_key]
  );
  if (mem2.rows[0].hit_count !== 2) {
    throw new Error(`Expected hit_count=2 after second upsert, got ${mem2.rows[0].hit_count}`);
  }
  console.log('OK: hit_count incremented to 2');

  await deleteFixtureTransactions();
  await pool.query(`DELETE FROM bank_import_batches WHERE imported_by = $1`, [
    TEST_IMPORTED_BY,
  ]);

  const imp2 = await importBankCsv({
    csvText,
    bankProfile: 'anz',
    fileName: 'anz-sample.csv',
    importedBy: TEST_IMPORTED_BY,
  });
  const middy2r = await pool.query(
    `SELECT t.id, t.category_status, t.suggestion_source
     FROM bank_transactions t
     JOIN bank_import_batches b ON b.id = t.import_batch_id
     WHERE b.imported_by = $1 AND t.description_norm ILIKE '%MIDDY%'
     LIMIT 1`,
    [TEST_IMPORTED_BY]
  );
  const middy2 = middy2r.rows[0];
  if (!middy2 || middy2.category_status !== 'confirmed') {
    throw new Error('Re-import: MIDDY should auto-confirm from memory');
  }
  const src = await pool.query(
    `SELECT suggestion_source FROM bank_transactions WHERE id = $1`,
    [middy2.id]
  );
  if (src.rows[0].suggestion_source !== 'memory') {
    throw new Error('Expected suggestion_source=memory on re-import');
  }
  console.log('OK: second import auto-confirmed via memory');

  const bp = await findSuggestedByDesc('BP FUEL');
  const bpKey = bp.counterparty_key;
  const bulk = await bulkConfirmByCounterparty({
    counterpartyKey: bpKey,
    categoryCode: 'fuel',
    remember: true,
    confirmedBy: 'test-bank-memory',
  });
  if (bulk.confirmed_count < 1) {
    throw new Error('Bulk confirm expected at least 1 row');
  }
  console.log('OK: bulk confirm', bulk.confirmed_count, 'row(s)');

  const suggestedLeft = await pool.query(
    `SELECT COUNT(*)::int AS n FROM bank_transactions t
     JOIN bank_import_batches b ON b.id = t.import_batch_id
     WHERE b.imported_by = $1 AND t.category_status = 'suggested' AND t.counterparty_key = $2`,
    [TEST_IMPORTED_BY, bpKey]
  );
  if (suggestedLeft.rows[0].n !== 0) {
    throw new Error('BP counterparty should have no suggested rows left');
  }

  const confirmedMiddy = await pool.query(
    `SELECT category_status FROM bank_transactions t
     JOIN bank_import_batches b ON b.id = t.import_batch_id
     WHERE b.imported_by = $1 AND t.description_norm ILIKE '%MIDDY%'`,
    [TEST_IMPORTED_BY]
  );
  if (confirmedMiddy.rows[0].category_status !== 'confirmed') {
    throw new Error('No silent mutation: MIDDY must stay confirmed');
  }
  console.log('OK: no silent mutation on confirmed row');

  console.log('\nAll PR6B memory tests passed.');
  await pool.end();
}

main().catch(async (e) => {
  console.error(e.message || e);
  try {
    await pool.end();
  } catch (_) {}
  process.exit(1);
});
