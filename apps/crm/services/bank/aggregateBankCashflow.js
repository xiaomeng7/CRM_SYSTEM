/**
 * Aggregate confirmed bank transactions for operational cashflow (PR6C).
 */

const { pool } = require('../../lib/db');
const {
  roundMoney,
  getAdelaideYmd,
  addDaysYmd,
  isYmdInRange,
} = require('../../lib/cashflow-dates');
const { detectRecurringPatterns, listActivePatterns } = require('./recurringDetector');

async function hasConfirmedBankData(db, snapshotYmd) {
  const since = addDaysYmd(snapshotYmd, -30);
  const r = await db.query(
    `SELECT 1 FROM bank_transactions
     WHERE category_status = 'confirmed' AND txn_date >= $1::date
     LIMIT 1`,
    [since]
  );
  return r.rows.length > 0;
}

async function sumWeekFlows(db, periodStart, periodEnd) {
  const r = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END), 0) AS outflow,
       COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS inflow
     FROM bank_transactions
     WHERE category_status = 'confirmed'
       AND COALESCE(is_transfer, false) = false
       AND txn_date >= $1::date AND txn_date <= $2::date`,
    [periodStart, periodEnd]
  );
  return {
    actual_week_outflow: roundMoney(Math.abs(Number(r.rows[0].outflow))),
    actual_week_inflow: roundMoney(Number(r.rows[0].inflow)),
  };
}

async function sumCategory30d(db, categoryCode, snapshotYmd) {
  const start = addDaysYmd(snapshotYmd, -30);
  const r = await db.query(
    `SELECT COALESCE(SUM(ABS(t.amount)), 0) AS total
     FROM bank_transactions t
     INNER JOIN transaction_categories c ON c.id = t.category_id
     WHERE t.category_status = 'confirmed'
       AND c.code = $1
       AND t.amount < 0
       AND t.txn_date >= $2::date AND t.txn_date <= $3::date`,
    [categoryCode, start, snapshotYmd]
  );
  return roundMoney(Number(r.rows[0].total));
}

async function topOutflows(db, snapshotYmd, limit = 5) {
  const start = addDaysYmd(snapshotYmd, -30);
  const r = await db.query(
    `SELECT t.counterparty_key, c.code AS category_code,
            SUM(ABS(t.amount)) AS total, COUNT(*)::int AS tx_count
     FROM bank_transactions t
     INNER JOIN transaction_categories c ON c.id = t.category_id
     WHERE t.category_status = 'confirmed'
       AND t.amount < 0
       AND COALESCE(t.is_transfer, false) = false
       AND t.txn_date >= $1::date AND t.txn_date <= $2::date
     GROUP BY t.counterparty_key, c.code
     ORDER BY total DESC
     LIMIT $3`,
    [start, snapshotYmd, limit]
  );
  return r.rows.map((row) => ({
    counterparty_key: row.counterparty_key,
    category_code: row.category_code,
    total: roundMoney(row.total),
    tx_count: row.tx_count,
  }));
}

function sumRecurringInRange(patterns, snapshotYmd, daysAhead) {
  const end = addDaysYmd(snapshotYmd, daysAhead);
  let total = 0;
  const items = [];
  for (const p of patterns) {
    if (!p.next_expected_date) continue;
    if (
      isYmdInRange(p.next_expected_date, snapshotYmd, end) ||
      p.next_expected_date === snapshotYmd
    ) {
      const amt = roundMoney(Math.abs(Number(p.typical_amount)));
      total = roundMoney(total + amt);
      items.push({
        id: p.id,
        category_code: p.category_code,
        counterparty_key: p.counterparty_key,
        cadence: p.cadence,
        typical_amount: p.typical_amount,
        next_expected_date: p.next_expected_date,
        confidence: p.confidence,
      });
    }
  }
  return { total, items };
}

function upcomingPayroll(patterns, snapshotYmd, daysAhead) {
  const end = addDaysYmd(snapshotYmd, daysAhead);
  return patterns.filter(
    (p) =>
      p.category_code === 'payroll' &&
      p.next_expected_date &&
      p.next_expected_date >= snapshotYmd &&
      p.next_expected_date <= end
  );
}

/**
 * @param {object} options
 * @param {string} options.snapshotDate
 * @param {string} options.periodStart
 * @param {string} options.periodEnd
 * @param {boolean} [options.runDetection=true]
 */
async function aggregateBankCashflow(options = {}) {
  const db = options.db || pool;
  const snapshotYmd = options.snapshotDate || getAdelaideYmd();
  const periodStart = options.periodStart;
  const periodEnd = options.periodEnd;

  const hasBank = await hasConfirmedBankData(db, snapshotYmd);

  if (options.runDetection !== false && hasBank) {
    await detectRecurringPatterns({ db, snapshotDate: snapshotYmd });
  }

  const patterns = hasBank ? await listActivePatterns(db, snapshotYmd) : [];
  const weekFlows = hasBank
    ? await sumWeekFlows(db, periodStart, periodEnd)
    : { actual_week_outflow: 0, actual_week_inflow: 0 };

  const next7 = sumRecurringInRange(patterns, snapshotYmd, 7);
  const next14 = sumRecurringInRange(patterns, snapshotYmd, 14);
  const payrollUpcoming = upcomingPayroll(patterns, snapshotYmd, 14);

  const supplier30 = hasBank ? await sumCategory30d(db, 'supplier', snapshotYmd) : 0;
  const payroll30 = hasBank ? await sumCategory30d(db, 'payroll', snapshotYmd) : 0;
  const topOut = hasBank ? await topOutflows(db, snapshotYmd, 5) : [];

  const topSupplier =
    topOut.find((x) => x.category_code === 'supplier') || topOut[0] || null;

  return {
    has_bank_data: hasBank,
    actual_week_outflow: weekFlows.actual_week_outflow,
    actual_week_inflow: weekFlows.actual_week_inflow,
    supplier_30d_total: supplier30,
    payroll_30d_total: payroll30,
    top_outflows: topOut,
    top_supplier_pressure: topSupplier,
    recurring_next_7d: next7.total,
    recurring_next_14d: next14.total,
    recurring_upcoming_7d: next7.items,
    recurring_upcoming_14d: next14.items,
    upcoming_payroll: payrollUpcoming.map((p) => ({
      counterparty_key: p.counterparty_key,
      typical_amount: roundMoney(Math.abs(Number(p.typical_amount))),
      next_expected_date: p.next_expected_date,
      cadence: p.cadence,
      confidence: p.confidence,
    })),
    active_recurring_count: patterns.length,
    recurring_patterns: patterns.map((p) => ({
      id: p.id,
      category_code: p.category_code,
      counterparty_key: p.counterparty_key,
      cadence: p.cadence,
      typical_amount: roundMoney(p.typical_amount),
      next_expected_date: p.next_expected_date,
      occurrence_count: p.occurrence_count,
      confidence: p.confidence,
    })),
  };
}

module.exports = {
  aggregateBankCashflow,
  hasConfirmedBankData,
};
