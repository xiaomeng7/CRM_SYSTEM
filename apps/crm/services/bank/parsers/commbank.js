/**
 * Commonwealth Bank CSV parser.
 * Typical: Date, Amount, Description, Balance (or Debit/Credit).
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

function parseCommBankCsv(text) {
  const rows = parseCsvRows(text);
  if (!rows.length) {
    return { transactions: [], errors: [{ line: 0, message: 'Empty file' }] };
  }

  const header = rows[0];
  const map = headerIndexMap(header);
  const dateIdx = findColumn(map, ['date', 'transaction date']);
  const descIdx = findColumn(map, ['description', 'narrative', 'details', 'transaction details']);
  const amountIdx = findColumn(map, ['amount', 'transaction amount']);
  const debitIdx = findColumn(map, ['debit', 'debit amount']);
  const creditIdx = findColumn(map, ['credit', 'credit amount']);
  const balanceIdx = findColumn(map, ['balance', 'running balance']);

  if (dateIdx == null) {
    return { transactions: [], errors: [{ line: 1, message: 'Missing Date column' }] };
  }

  const transactions = [];
  const errors = [];

  for (let i = 1; i < rows.length; i++) {
    const lineNum = i + 1;
    const row = rows[i];
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
      } else {
        errors.push({ line: lineNum, message: 'Missing amount column' });
        continue;
      }

      if (amount == null || amount === 0) continue;

      const description_norm = normalizeDescription(description_raw);
      const balRaw = balanceIdx != null ? parseMoney(row[balanceIdx]) : null;
      const balance_after = balRaw != null ? roundMoney(balRaw) : null;

      transactions.push({
        txn_date: txnDate,
        amount,
        balance_after: Number.isFinite(balance_after) ? balance_after : null,
        description_raw,
        description_norm,
        direction,
        metadata: { line: lineNum, bank: 'commbank' },
      });
    } catch (e) {
      errors.push({ line: lineNum, message: e.message || 'Parse error' });
    }
  }

  return { transactions, errors };
}

module.exports = { parseCommBankCsv };
