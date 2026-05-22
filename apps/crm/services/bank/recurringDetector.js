/**
 * Deterministic recurring obligation detection (PR6C).
 * Input: confirmed outflows only, last 180 days. No AI.
 */

const { pool } = require('../../lib/db');
const {
  roundMoney,
  getAdelaideYmd,
  addDaysYmd,
  ymdFromValue,
} = require('../../lib/cashflow-dates');

const LOOKBACK_DAYS = 180;
const MIN_OCCURRENCES = 3;

const CADENCE_WINDOWS = {
  weekly: [6, 8],
  fortnightly: [13, 15],
  monthly: [27, 33],
  quarterly: [85, 95],
};

const CADENCE_STEP_DAYS = {
  weekly: 7,
  fortnightly: 14,
  monthly: 30,
  quarterly: 90,
};

const EXCLUDED_CATEGORIES = new Set([
  'transfer',
  'owner_draw',
  'customer_payment',
  'unknown',
]);

function daysBetweenYmd(a, b) {
  const pa = a.split('-').map(Number);
  const pb = b.split('-').map(Number);
  const da = Date.UTC(pa[0], pa[1] - 1, pa[2]);
  const db = Date.UTC(pb[0], pb[1] - 1, pb[2]);
  return Math.round((db - da) / 86400000);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return roundMoney((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return roundMoney(sorted[mid]);
}

function confidenceFromCount(n) {
  if (n >= 9) return 'high';
  if (n >= 5) return 'medium';
  return 'low';
}

function detectCadence(intervals) {
  if (!intervals.length) return null;
  let best = null;
  let bestCount = 0;
  for (const [cadence, [lo, hi]] of Object.entries(CADENCE_WINDOWS)) {
    const count = intervals.filter((d) => d >= lo && d <= hi).length;
    if (count > bestCount) {
      bestCount = count;
      best = cadence;
    }
  }
  const need = Math.max(2, Math.ceil(intervals.length * 0.5));
  return bestCount >= need ? best : null;
}

function amountsStable(amounts, categoryCode) {
  const abs = amounts.map((a) => Math.abs(roundMoney(a)));
  const typical = median(abs);
  if (typical <= 0) return false;
  const tol = categoryCode === 'payroll' ? 0.2 : 0.15;
  let ok = 0;
  for (const a of abs) {
    if (Math.abs(a - typical) / typical <= tol) ok++;
  }
  return ok >= Math.ceil(abs.length * 0.75);
}

function groupKey(categoryCode, counterpartyKey) {
  return `${categoryCode}::${counterpartyKey || ''}`;
}

async function fetchConfirmedOutflows(db, snapshotYmd) {
  const start = addDaysYmd(snapshotYmd, -LOOKBACK_DAYS);
  const r = await db.query(
    `SELECT t.txn_date::text AS txn_date, t.amount, t.counterparty_key, c.code AS category_code
     FROM bank_transactions t
     INNER JOIN transaction_categories c ON c.id = t.category_id
     WHERE t.category_status = 'confirmed'
       AND t.amount < 0
       AND COALESCE(t.is_transfer, false) = false
       AND t.txn_date >= $1::date
       AND t.txn_date <= $2::date
     ORDER BY t.txn_date ASC`,
    [start, snapshotYmd]
  );
  return r.rows.filter((row) => !EXCLUDED_CATEGORIES.has(row.category_code));
}

function analyzeGroup(rows) {
  if (rows.length < MIN_OCCURRENCES) return null;

  const dates = rows.map((r) => String(r.txn_date).slice(0, 10)).sort();
  const intervals = [];
  for (let i = 1; i < dates.length; i++) {
    intervals.push(daysBetweenYmd(dates[i - 1], dates[i]));
  }

  const cadence = detectCadence(intervals);
  if (!cadence) return null;

  const categoryCode = rows[0].category_code;
  const amounts = rows.map((r) => Number(r.amount));
  if (!amountsStable(amounts, categoryCode)) return null;

  const typical_amount = median(amounts.map((a) => roundMoney(a)));
  const last_seen_date = dates[dates.length - 1];
  const next_expected_date = addDaysYmd(
    last_seen_date,
    CADENCE_STEP_DAYS[cadence]
  );
  const occurrence_count = rows.length;

  return {
    category_code: categoryCode,
    counterparty_key: rows[0].counterparty_key || '',
    cadence,
    typical_amount,
    last_seen_date,
    next_expected_date,
    occurrence_count,
    confidence: confidenceFromCount(occurrence_count),
  };
}

async function isDismissed(db, pattern) {
  const r = await db.query(
    `SELECT id FROM recurring_patterns
     WHERE counterparty_key = $1 AND category_code = $2 AND cadence = $3 AND status = 'dismissed'
     LIMIT 1`,
    [pattern.counterparty_key || '', pattern.category_code, pattern.cadence]
  );
  return r.rows.length > 0;
}

async function upsertActivePattern(db, pattern) {
  const r = await db.query(
    `INSERT INTO recurring_patterns (
       category_code, counterparty_key, cadence, typical_amount,
       next_expected_date, last_seen_date, occurrence_count, confidence, status, updated_at
     ) VALUES ($1,$2,$3,$4,$5::date,$6::date,$7,$8,'active',NOW())
     ON CONFLICT (counterparty_key, category_code, cadence)
       WHERE status = 'active'
     DO UPDATE SET
       typical_amount = EXCLUDED.typical_amount,
       next_expected_date = EXCLUDED.next_expected_date,
       last_seen_date = EXCLUDED.last_seen_date,
       occurrence_count = EXCLUDED.occurrence_count,
       confidence = EXCLUDED.confidence,
       updated_at = NOW()
     RETURNING id, category_code, counterparty_key, cadence, typical_amount,
               next_expected_date, last_seen_date, occurrence_count, confidence, status`,
    [
      pattern.category_code,
      pattern.counterparty_key || '',
      pattern.cadence,
      pattern.typical_amount,
      pattern.next_expected_date,
      pattern.last_seen_date,
      pattern.occurrence_count,
      pattern.confidence,
    ]
  );
  return normalizePatternRow(r.rows[0]);
}

function normalizePatternRow(row) {
  if (!row) return row;
  return {
    ...row,
    next_expected_date: ymdFromValue(row.next_expected_date),
    last_seen_date: ymdFromValue(row.last_seen_date),
    typical_amount: roundMoney(row.typical_amount),
  };
}

/**
 * Run detection and upsert active patterns (never deletes dismissed).
 * @returns {{ patterns: Array, detected: number, skipped_dismissed: number }}
 */
async function detectRecurringPatterns(options = {}) {
  const db = options.db || pool;
  const snapshotYmd = options.snapshotDate || getAdelaideYmd(options.referenceDate);
  const rows = await fetchConfirmedOutflows(db, snapshotYmd);

  const groups = new Map();
  for (const row of rows) {
    const key = groupKey(row.category_code, row.counterparty_key);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const patterns = [];
  let skippedDismissed = 0;

  for (const groupRows of groups.values()) {
    const analyzed = analyzeGroup(groupRows);
    if (!analyzed) continue;
    if (await isDismissed(db, analyzed)) {
      skippedDismissed++;
      continue;
    }
    const saved = await upsertActivePattern(db, analyzed);
    patterns.push(saved);
  }

  return {
    patterns,
    detected: patterns.length,
    skipped_dismissed: skippedDismissed,
    snapshot_date: snapshotYmd,
  };
}

async function listActivePatterns(db = pool, snapshotYmd) {
  const r = await db.query(
    `SELECT id, category_code, counterparty_key, cadence, typical_amount,
            next_expected_date, last_seen_date, occurrence_count, confidence, status
     FROM recurring_patterns
     WHERE status = 'active'
     ORDER BY next_expected_date ASC NULLS LAST`
  );
  return r.rows.map((row) => ({
    ...row,
    next_expected_date: ymdFromValue(row.next_expected_date),
    last_seen_date: ymdFromValue(row.last_seen_date),
    typical_amount: roundMoney(row.typical_amount),
  }));
}

async function dismissPattern(patternId, dismissedBy = 'founder', db = pool) {
  const r = await db.query(
    `UPDATE recurring_patterns SET
       status = 'dismissed',
       dismissed_at = NOW(),
       dismissed_by = $2,
       updated_at = NOW()
     WHERE id = $1 AND status = 'active'
     RETURNING id, status`,
    [patternId, dismissedBy]
  );
  if (!r.rows[0]) {
    const err = new Error('Pattern not found or already dismissed');
    err.code = 'NOT_FOUND';
    throw err;
  }
  return r.rows[0];
}

module.exports = {
  detectRecurringPatterns,
  listActivePatterns,
  dismissPattern,
  fetchConfirmedOutflows,
  analyzeGroup,
  LOOKBACK_DAYS,
  MIN_OCCURRENCES,
};
