/**
 * ANZ bank CSV parser.
 * Typical headers: Date, Amount, Description (or Debit/Credit columns).
 */

const {
  parseCsvRows,
  headerIndexMap,
  findColumn,
  parseDateAU,
  parseMoney,
  roundMoney,
} = require('./base');
const { normalizeDescription } = require('../counterpartyKey');

function parseAnzCsv(text) {
  const rows = parseCsvRows(text);
  if (!rows.length) {
    return { transactions: [], errors: [{ line: 0, message: 'Empty file' }] };
  }

  const header = rows[0];
  const map = headerIndexMap(header);
  const dateIdx = findColumn(map, ['date', 'transaction date']);
  const descIdx = findColumn(map, ['description', 'details', 'narrative']);
  const amountIdx = findColumn(map, ['amount', 'transaction amount']);
  const debitIdx = findColumn(map, ['debit', 'debit amount', 'withdrawal']);
  const creditIdx = findColumn(map, ['credit', 'credit amount', 'deposit']);
  const balanceIdx = findColumn(map, ['balance']);

  if (dateIdx == null) {
    return { transactions: [], errors: [{ line: 1, message: 'Missing Date column' }] };
  }
  if (descIdx == null && amountIdx == null && debitIdx == null && creditIdx == null) {
    return { transactions: [], errors: [{ line: 1, message: 'Missing amount/description columns' }] };
  }

  const transactions = [];
  const errors = [];
  const dataRows = looksLikeHeaderData(rows) ? rows.slice(1) : rows.slice(1);

  for (let i = 0; i < dataRows.length; i++) {
    const lineNum = i + 2;
    const row = dataRows[i];
    if (!row || row.every((c) => !String(c).trim())) continue;

    try {
      const txnDate = parseDateAU(row[dateIdx]);
      if (!txnDate) {
        errors.push({ line: lineNum, message: 'Invalid date' });
        continue;
      }

      const description_raw = descIdx != null ? String(row[descIdx] || '').trim() : '';
      let amount = null;
      let direction = 'debit';

      if (debitIdx != null || creditIdx != null) {
        const debit = debitIdx != null ? parseMoney(row[debitIdx]) : null;
        const credit = creditIdx != null ? parseMoney(row[creditIdx]) : null;
        if (credit != null && Math.abs(credit) > 0) {
          amount = roundMoney(Math.abs(credit));
          direction = 'credit';
        } else if (debit != null && Math.abs(debit) > 0) {
          amount = roundMoney(-Math.abs(debit));
          direction = 'debit';
        }
      } else if (amountIdx != null) {
        const raw = parseMoney(row[amountIdx]);
        if (raw == null) {
          errors.push({ line: lineNum, message: 'Invalid amount' });
          continue;
        }
        amount = roundMoney(raw);
        direction = amount < 0 ? 'debit' : 'credit';
      }

      if (amount == null || amount === 0) {
        errors.push({ line: lineNum, message: 'Zero or missing amount' });
        continue;
      }

      const description_norm = normalizeDescription(description_raw);
      const balance_after =
        balanceIdx != null ? roundMoney(parseMoney(row[balanceIdx])) : null;

      transactions.push({
        txn_date: txnDate,
        amount,
        balance_after: Number.isFinite(balance_after) ? balance_after : null,
        description_raw,
        description_norm,
        direction,
        metadata: { line: lineNum, bank: 'anz' },
      });
    } catch (e) {
      errors.push({ line: lineNum, message: e.message || 'Parse error' });
    }
  }

  return { transactions, errors };
}

function looksLikeHeaderData(rows) {
  if (rows.length < 2) return true;
  const first = String(rows[0][0] || '').toLowerCase();
  return first.includes('date');
}

module.exports = { parseAnzCsv };
