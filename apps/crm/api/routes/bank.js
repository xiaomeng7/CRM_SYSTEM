/**
 * Bank CSV import + review API (PR6A/PR6B).
 * All routes require X-Admin-Secret or X-Sync-Secret.
 * Does not store raw CSV or log CSV content.
 */

const router = require('express').Router();
const express = require('express');
const { pool } = require('../../lib/db');
const { parseMultipartBuffer, fieldsFromParts } = require('../../lib/parseMultipart');
const { importBankCsv } = require('../../services/bank/importBankCsv');
const {
  confirmTransactionCategory,
  bulkConfirmByCounterparty,
  listReviewTransactions,
  listCategories,
} = require('../../services/bank/confirmCategory');
const {
  listActivePatterns,
  dismissPattern,
} = require('../../services/bank/recurringDetector');

const MAX_TX_LIMIT = 100;
const MAX_BATCH_LIST = 50;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function safeErrorMessage(err) {
  if (!err) return 'Request failed';
  const code = err.code;
  if (code === 'UNSUPPORTED_BANK') return err.message;
  if (code === 'EMPTY_CSV') return 'Empty CSV file';
  if (code === 'INVALID_CATEGORY') return err.message;
  if (code === 'NOT_FOUND') return 'Transaction not found';
  if (code === 'INVALID_INPUT') return err.message;
  const msg = String(err.message || err);
  if (/relation .* does not exist/i.test(msg)) {
    return 'Database migration required (064_bank_csv_import)';
  }
  if (/password|connection|ECONNREFUSED/i.test(msg)) {
    return 'Database unavailable';
  }
  return 'Request failed';
}

function statusFromError(err) {
  const code = err.code;
  if (code === 'UNSUPPORTED_BANK' || code === 'INVALID_CATEGORY' || code === 'INVALID_INPUT') {
    return 400;
  }
  if (code === 'NOT_FOUND') return 404;
  return 500;
}

function requireSecret(req, res) {
  const secret = process.env.SYNC_SECRET || process.env.ADMIN_SECRET;
  if (!secret) return true;
  const provided =
    req.headers['x-admin-secret'] ||
    req.headers['x-sync-secret'];
  if (provided !== secret) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}

router.use((req, res, next) => {
  if (!requireSecret(req, res)) return;
  next();
});

const rawMultipart = express.raw({
  type: () => true,
  limit: MAX_UPLOAD_BYTES,
});

router.post('/import', rawMultipart, async (req, res) => {
  try {
    const ct = req.headers['content-type'] || '';
    if (!ct.includes('multipart/form-data')) {
      return res.status(400).json({ ok: false, error: 'Expected multipart/form-data' });
    }

    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
    if (!buffer.length) {
      return res.status(400).json({ ok: false, error: 'Empty body' });
    }

    const parts = parseMultipartBuffer(buffer, ct);
    const { fields, files } = fieldsFromParts(parts);
    const bankProfile = fields.bank_profile || fields.bankProfile;
    const filePart = files.file || files.csv;

    if (!bankProfile) {
      return res.status(400).json({ ok: false, error: 'bank_profile is required' });
    }
    if (!filePart || !filePart.buffer.length) {
      return res.status(400).json({ ok: false, error: 'file is required' });
    }

    const csvText = filePart.buffer.toString('utf8');
    const result = await importBankCsv({
      csvText,
      bankProfile,
      fileName: filePart.filename || null,
      importedBy: 'api',
    });

    return res.json({
      ok: result.ok,
      batch_id: result.batch_id,
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors,
      period_start: result.period_start,
      period_end: result.period_end,
      needs_review: result.needs_review,
      status: result.status,
    });
  } catch (err) {
    return res.status(statusFromError(err)).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.get('/import/batches', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, MAX_BATCH_LIST);
    const r = await pool.query(
      `SELECT id, bank_profile, file_name, period_start, period_end,
              row_count, imported_count, skipped_count, error_count,
              status, errors, imported_by, created_at, finished_at
       FROM bank_import_batches
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    return res.json({ ok: true, batches: r.rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.get('/categories', async (req, res) => {
  try {
    const categories = await listCategories();
    return res.json({ ok: true, categories });
  } catch (err) {
    return res.status(500).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.get('/recurring', async (req, res) => {
  try {
    const patterns = await listActivePatterns();
    return res.json({ ok: true, patterns });
  } catch (err) {
    return res.status(500).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.post('/recurring/:id/dismiss', async (req, res) => {
  try {
    const row = await dismissPattern(req.params.id, 'founder');
    return res.json({ ok: true, pattern: row });
  } catch (err) {
    return res.status(statusFromError(err)).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.get('/transactions/review', async (req, res) => {
  try {
    const result = await listReviewTransactions({
      limit: req.query.limit,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      counterparty: req.query.counterparty,
      suggested_category: req.query.suggested_category || req.query.category,
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.post('/transactions/bulk-confirm', async (req, res) => {
  try {
    const { counterparty_key, category_code, remember } = req.body || {};
    if (!counterparty_key || !category_code) {
      return res.status(400).json({
        ok: false,
        error: 'counterparty_key and category_code are required',
      });
    }
    const result = await bulkConfirmByCounterparty({
      counterpartyKey: counterparty_key,
      categoryCode: category_code,
      remember: remember !== false,
      confirmedBy: 'founder',
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(statusFromError(err)).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.put('/transactions/:id/category', async (req, res) => {
  try {
    const { category_code, remember } = req.body || {};
    if (!category_code) {
      return res.status(400).json({ ok: false, error: 'category_code is required' });
    }
    const result = await confirmTransactionCategory(req.params.id, {
      categoryCode: category_code,
      remember: remember !== false,
      confirmedBy: 'founder',
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(statusFromError(err)).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.get('/transactions', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), MAX_TX_LIMIT);
    const conditions = [];
    const params = [];
    let n = 1;

    if (req.query.date_from) {
      conditions.push(`t.txn_date >= $${n++}::date`);
      params.push(req.query.date_from);
    }
    if (req.query.date_to) {
      conditions.push(`t.txn_date <= $${n++}::date`);
      params.push(req.query.date_to);
    }
    if (req.query.category_status) {
      conditions.push(`t.category_status = $${n++}`);
      params.push(req.query.category_status);
    }
    if (req.query.category) {
      conditions.push(`COALESCE(c.code, sc.code) = $${n++}`);
      params.push(req.query.category);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);

    const r = await pool.query(
      `SELECT t.id, t.txn_date, t.amount, t.balance_after,
              t.description_raw, t.description_norm, t.counterparty_key,
              t.direction, t.category_status, t.suggestion_source,
              t.suggestion_confidence, t.is_transfer, t.external_hash,
              t.import_batch_id, t.created_at,
              c.code AS category_code,
              sc.code AS suggested_category_code
       FROM bank_transactions t
       LEFT JOIN transaction_categories c ON c.id = t.category_id
       LEFT JOIN transaction_categories sc ON sc.id = t.suggested_category_id
       ${where}
       ORDER BY t.txn_date DESC, t.created_at DESC
       LIMIT $${n}`,
      params
    );

    return res.json({ ok: true, transactions: r.rows, count: r.rows.length });
  } catch (err) {
    return res.status(500).json({ ok: false, error: safeErrorMessage(err) });
  }
});

module.exports = router;
