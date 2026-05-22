/**
 * Suggest transaction category: memory → rules → unknown.
 */

const { pool } = require('../../lib/db');
const { matchCategoryByRules } = require('./categoryRules');
const { buildCounterpartyKey } = require('./counterpartyKey');

let categoryCache = null;

async function loadCategoryMap(db = pool) {
  if (categoryCache) return categoryCache;
  const r = await db.query(
    `SELECT id, code FROM transaction_categories WHERE active = true`
  );
  const byCode = {};
  const byId = {};
  for (const row of r.rows) {
    byCode[row.code] = row.id;
    byId[row.id] = row.code;
  }
  categoryCache = { byCode, byId };
  return categoryCache;
}

function clearCategoryCache() {
  categoryCache = null;
}

async function suggestCategory(txn, db = pool) {
  const { byCode } = await loadCategoryMap(db);
  const counterparty_key =
    txn.counterparty_key || buildCounterpartyKey(txn.description_norm);

  const mem = await db.query(
    `SELECT category_id FROM transaction_category_memory WHERE counterparty_key = $1`,
    [counterparty_key]
  );
  if (mem.rows[0]) {
    const categoryId = mem.rows[0].category_id;
    const code = (await loadCategoryMap(db)).byId[categoryId] || 'unknown';
    return {
      counterparty_key,
      category_id: categoryId,
      suggested_category_id: categoryId,
      category_status: 'confirmed',
      suggestion_source: 'memory',
      suggestion_confidence: 1,
      is_transfer: code === 'transfer',
    };
  }

  const rule = matchCategoryByRules(txn.description_norm, counterparty_key);
  const suggestedId = byCode[rule.code] || byCode.unknown;
  const isTransfer = rule.code === 'transfer';

  return {
    counterparty_key,
    category_id: null,
    suggested_category_id: suggestedId,
    category_status: 'suggested',
    suggestion_source: rule.source,
    suggestion_confidence: rule.confidence,
    is_transfer: isTransfer,
  };
}

module.exports = {
  suggestCategory,
  loadCategoryMap,
  clearCategoryCache,
};
