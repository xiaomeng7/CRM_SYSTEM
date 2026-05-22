/**
 * Bank CSV import orchestration (PR6A).
 */

const { pool } = require('../../lib/db');
const { parseBankCsv, isSupported } = require('./parsers');
const { buildCounterpartyKey } = require('./counterpartyKey');
const { suggestCategory, clearCategoryCache } = require('./categorySuggester');
const { buildExternalHash, roundMoney } = require('./parsers/base');

const MAX_ERRORS_STORED = 50;

/**
 * @param {object} options
 * @param {string} options.csvText
 * @param {string} options.bankProfile
 * @param {string} [options.fileName]
 * @param {string} [options.importedBy]
 * @param {import('pg').Pool|import('pg').PoolClient} [options.db]
 */
async function importBankCsv(options) {
  const db = options.db || pool;
  const bankProfile = String(options.bankProfile || '').trim().toLowerCase();
  const csvText = options.csvText || '';

  if (!isSupported(bankProfile)) {
    const err = new Error(`Unsupported bank_profile: ${bankProfile}. Use anz or commbank.`);
    err.code = 'UNSUPPORTED_BANK';
    throw err;
  }

  if (!csvText.trim()) {
    const err = new Error('Empty CSV content');
    err.code = 'EMPTY_CSV';
    throw err;
  }

  clearCategoryCache();

  const parsed = parseBankCsv(bankProfile, csvText);
  if (parsed.unsupported) {
    const err = new Error(parsed.errors[0]?.message || 'Unsupported bank');
    err.code = 'UNSUPPORTED_BANK';
    throw err;
  }

  const batchIns = await db.query(
    `INSERT INTO bank_import_batches (bank_profile, file_name, status, imported_by)
     VALUES ($1, $2, 'processing', $3)
     RETURNING id`,
    [bankProfile, options.fileName || null, options.importedBy || 'admin']
  );
  const batchId = batchIns.rows[0].id;

  let imported = 0;
  let skipped = 0;
  let needsReview = 0;
  const errors = (parsed.errors || []).slice(0, MAX_ERRORS_STORED);
  const rowCount = (parsed.transactions || []).length + errors.length;

  let periodStart = null;
  let periodEnd = null;

  try {
    for (const txn of parsed.transactions || []) {
      if (!txn.counterparty_key) {
        txn.counterparty_key = buildCounterpartyKey(txn.description_norm);
      }

      const externalHash = buildExternalHash(
        bankProfile,
        txn.txn_date,
        txn.amount,
        txn.description_norm || ''
      );

      const dup = await db.query(
        `SELECT id FROM bank_transactions WHERE external_hash = $1`,
        [externalHash]
      );
      if (dup.rows.length) {
        skipped++;
        continue;
      }

      const suggestion = await suggestCategory(txn, db);
      if (suggestion.category_status === 'suggested') needsReview++;

      if (!periodStart || txn.txn_date < periodStart) periodStart = txn.txn_date;
      if (!periodEnd || txn.txn_date > periodEnd) periodEnd = txn.txn_date;

      await db.query(
        `INSERT INTO bank_transactions (
           import_batch_id, txn_date, amount, balance_after,
           description_raw, description_norm, counterparty_key, direction,
           category_id, category_status, suggested_category_id,
           suggestion_source, suggestion_confidence, is_transfer, external_hash, metadata
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb
         )`,
        [
          batchId,
          txn.txn_date,
          roundMoney(txn.amount),
          txn.balance_after,
          txn.description_raw,
          txn.description_norm,
          suggestion.counterparty_key,
          txn.direction,
          suggestion.category_id,
          suggestion.category_status,
          suggestion.suggested_category_id,
          suggestion.suggestion_source,
          suggestion.suggestion_confidence,
          suggestion.is_transfer,
          externalHash,
          JSON.stringify(txn.metadata || {}),
        ]
      );
      imported++;
    }

    const status = errors.length && imported === 0 ? 'failed' : 'completed';

    await db.query(
      `UPDATE bank_import_batches SET
         period_start = $2::date,
         period_end = $3::date,
         row_count = $4,
         imported_count = $5,
         skipped_count = $6,
         error_count = $7,
         status = $8,
         errors = $9::jsonb,
         finished_at = NOW()
       WHERE id = $1`,
      [
        batchId,
        periodStart,
        periodEnd,
        rowCount,
        imported,
        skipped,
        errors.length,
        status,
        JSON.stringify(errors),
      ]
    );

    return {
      ok: status === 'completed',
      batch_id: batchId,
      bank_profile: bankProfile,
      imported,
      skipped,
      errors,
      error_count: errors.length,
      period_start: periodStart,
      period_end: periodEnd,
      needs_review: needsReview,
      status,
    };
  } catch (e) {
    await db.query(
      `UPDATE bank_import_batches SET status = 'failed', errors = $2::jsonb, finished_at = NOW() WHERE id = $1`,
      [batchId, JSON.stringify([{ line: 0, message: 'Import failed' }])]
    );
    throw e;
  }
}

module.exports = {
  importBankCsv,
};
