/**
 * Founder category confirmation + operational memory (PR6B).
 * No AI. No silent mutation of confirmed rows on import (dedupe only).
 */

const { pool } = require('../../lib/db');
const { loadCategoryMap, clearCategoryCache } = require('./categorySuggester');

async function getCategoryIdByCode(code, db = pool) {
  const { byCode } = await loadCategoryMap(db);
  const id = byCode[String(code || '').trim().toLowerCase()];
  if (!id) {
    const err = new Error(`Unknown category_code: ${code}`);
    err.code = 'INVALID_CATEGORY';
    throw err;
  }
  return id;
}

/**
 * UPSERT founder memory for counterparty.
 */
async function upsertCategoryMemory(
  { counterpartyKey, categoryId, confirmedBy = 'founder' },
  db = pool
) {
  const key = String(counterpartyKey || '').trim().slice(0, 200);
  if (!key) return null;

  const r = await db.query(
    `INSERT INTO transaction_category_memory (
       counterparty_key, category_id, match_type, confirmed_by, confirmed_at, hit_count
     ) VALUES ($1, $2, 'exact', $3, NOW(), 1)
     ON CONFLICT (counterparty_key) DO UPDATE SET
       category_id = EXCLUDED.category_id,
       confirmed_by = EXCLUDED.confirmed_by,
       confirmed_at = NOW(),
       hit_count = transaction_category_memory.hit_count + 1
     RETURNING id, counterparty_key, category_id, hit_count, confirmed_at`,
    [key, categoryId, confirmedBy]
  );
  return r.rows[0];
}

/**
 * Confirm a single transaction (only updates that row).
 */
async function confirmTransactionCategory(
  transactionId,
  { categoryCode, remember = true, confirmedBy = 'founder' },
  db = pool
) {
  const categoryId = await getCategoryIdByCode(categoryCode, db);
  const isTransfer = categoryCode === 'transfer';

  const existing = await db.query(
    `SELECT id, counterparty_key, category_status FROM bank_transactions WHERE id = $1`,
    [transactionId]
  );
  if (!existing.rows[0]) {
    const err = new Error('Transaction not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const row = existing.rows[0];

  const upd = await db.query(
    `UPDATE bank_transactions SET
       category_id = $2,
       category_status = 'confirmed',
       suggested_category_id = $2,
       suggestion_source = 'founder',
       suggestion_confidence = 1,
       is_transfer = $3
     WHERE id = $1
     RETURNING id, txn_date, amount, description_norm, counterparty_key, category_status`,
    [transactionId, categoryId, isTransfer]
  );

  let memory = null;
  if (remember && row.counterparty_key) {
    memory = await upsertCategoryMemory(
      {
        counterpartyKey: row.counterparty_key,
        categoryId,
        confirmedBy,
      },
      db
    );
  }

  clearCategoryCache();
  return { transaction: upd.rows[0], memory };
}

/**
 * Bulk-confirm all suggested rows for a counterparty_key.
 */
async function bulkConfirmByCounterparty(
  { counterpartyKey, categoryCode, remember = true, confirmedBy = 'founder' },
  db = pool
) {
  const key = String(counterpartyKey || '').trim();
  if (!key) {
    const err = new Error('counterparty_key is required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const categoryId = await getCategoryIdByCode(categoryCode, db);
  const isTransfer = categoryCode === 'transfer';

  const upd = await db.query(
    `UPDATE bank_transactions SET
       category_id = $2,
       category_status = 'confirmed',
       suggested_category_id = $2,
       suggestion_source = 'founder',
       suggestion_confidence = 1,
       is_transfer = $3
     WHERE counterparty_key = $1 AND category_status = 'suggested'
     RETURNING id`,
    [key, categoryId, isTransfer]
  );

  let memory = null;
  if (remember) {
    memory = await upsertCategoryMemory(
      { counterpartyKey: key, categoryId, confirmedBy },
      db
    );
  }

  clearCategoryCache();
  return {
    confirmed_count: upd.rows.length,
    transaction_ids: upd.rows.map((r) => r.id),
    memory,
  };
}

/**
 * Review queue: suggested transactions only.
 */
async function listReviewTransactions(filters = {}, db = pool) {
  const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 50, 1), 100);
  const conditions = [`t.category_status = 'suggested'`];
  const params = [];
  let n = 1;

  if (filters.date_from) {
    conditions.push(`t.txn_date >= $${n++}::date`);
    params.push(filters.date_from);
  }
  if (filters.date_to) {
    conditions.push(`t.txn_date <= $${n++}::date`);
    params.push(filters.date_to);
  }
  if (filters.counterparty) {
    conditions.push(`t.counterparty_key ILIKE $${n++}`);
    params.push(`%${filters.counterparty}%`);
  }
  if (filters.suggested_category) {
    conditions.push(`sc.code = $${n++}`);
    params.push(filters.suggested_category);
  }

  params.push(limit);
  const where = conditions.join(' AND ');

  const r = await db.query(
    `SELECT t.id, t.txn_date, t.amount, t.balance_after,
            t.description_raw, t.description_norm, t.counterparty_key,
            t.direction, t.category_status, t.suggestion_source,
            t.suggestion_confidence, t.is_transfer, t.created_at,
            sc.code AS suggested_category_code,
            sc.label AS suggested_category_label
     FROM bank_transactions t
     LEFT JOIN transaction_categories sc ON sc.id = t.suggested_category_id
     WHERE ${where}
     ORDER BY t.txn_date DESC, t.created_at DESC
     LIMIT $${n}`,
    params
  );

  return { transactions: r.rows, count: r.rows.length };
}

async function listCategories(db = pool) {
  const r = await db.query(
    `SELECT code, label, direction_hint, sort_order
     FROM transaction_categories
     WHERE active = true
     ORDER BY sort_order, code`
  );
  return r.rows;
}

module.exports = {
  getCategoryIdByCode,
  upsertCategoryMemory,
  confirmTransactionCategory,
  bulkConfirmByCounterparty,
  listReviewTransactions,
  listCategories,
};
