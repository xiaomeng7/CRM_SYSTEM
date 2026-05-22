/**
 * Cashflow Facts Engine (Phase 1A) — deterministic metrics, no LLM.
 * Reuses invoiceOverdueAutomation for overdue totals and collection priority.
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../../lib/db');
const { aggregateBankCashflow } = require('../bank/aggregateBankCashflow');
const {
  scanOverdueInvoices,
  getLevelToTrigger,
} = require('../invoiceOverdueAutomation');
const { OVERDUE_LEVEL } = require('../../lib/invoice-overdue-config');
const automationSettings = require('../automationSettings');

const {
  TIMEZONE,
  roundMoney: roundMoneyLib,
  getAdelaideYmd: getAdelaideYmdLib,
  addDaysYmd: addDaysYmdLib,
  isYmdInRange: isYmdInRangeLib,
} = require('../../lib/cashflow-dates');

const CURRENCY = 'AUD';
const DEFAULTS_PATH = path.join(__dirname, '../../config/cashflow-weekly-defaults.json');
const OPEN_QUOTE_STATUSES = ['sent', 'pending', 'open', 'awaiting', 'active'];
const PIPELINE_STAGES = ['quote_sent', 'decision_pending'];
const TOP_INVOICE_LIMIT = 5;

// ---------------------------------------------------------------------------
// Money & dates (deterministic)
// ---------------------------------------------------------------------------

function roundMoney(value) {
  return roundMoneyLib(value);
}

function sumMoney(items, pickAmount) {
  let total = 0;
  for (const item of items) {
    total += roundMoney(pickAmount(item));
  }
  return roundMoney(total);
}

function getAdelaideYmd(refDate = new Date()) {
  return getAdelaideYmdLib(refDate);
}

function parseYmd(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return { y, m, d };
}

function formatYmdFromUtcDate(dt) {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysYmd(ymd, days) {
  return addDaysYmdLib(ymd, days);
}

function compareYmd(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function isYmdInRange(ymd, start, end) {
  return isYmdInRangeLib(ymd, start, end);
}

/** ISO week: Monday–Sunday containing snapshot_date (Adelaide calendar dates). */
function getAdelaideWeekBounds(snapshotYmd) {
  const { y, m, d } = parseYmd(snapshotYmd);
  const noon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dayOfWeek = noon.getUTCDay();
  const toMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const period_start = addDaysYmd(snapshotYmd, toMonday);
  const period_end = addDaysYmd(period_start, 6);
  return {
    snapshot_date: snapshotYmd,
    period_start,
    period_end,
    timezone: TIMEZONE,
  };
}

function isPaidStatus(status) {
  return String(status || '').trim().toLowerCase() === 'paid';
}

function ymdFromRowDate(value) {
  if (!value) return null;
  if (value instanceof Date) return formatYmdFromUtcDate(value);
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function isJobComplete(row) {
  if (!row.job_id) return true;
  if (row.job_completed_at) return true;
  return String(row.job_status || '').toLowerCase().includes('complete');
}

function isUnpaidEligible(row) {
  return !isPaidStatus(row.status) && roundMoney(row.amount) > 0 && isJobComplete(row);
}

// ---------------------------------------------------------------------------
// Weekly expense config
// ---------------------------------------------------------------------------

function loadDefaultsFromFile() {
  try {
    const raw = fs.readFileSync(DEFAULTS_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return {
      currency: CURRENCY,
      timezone: TIMEZONE,
      weekly_fixed: 0,
      payroll: [],
      supplier_payments: [],
      quote_conversion_rate: 0.35,
      pipeline_conversion_rate: 0.25,
      scheduled_job_conversion_rate: 0.5,
    };
  }
}

async function loadWeeklyConfig() {
  const raw = await automationSettings.get('cashflow_weekly_config');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return { config: parsed, config_source: 'automation_settings' };
    } catch (_) {
      return { config: loadDefaultsFromFile(), config_source: 'file_fallback_invalid_json' };
    }
  }
  return { config: loadDefaultsFromFile(), config_source: 'file_defaults' };
}

function buildExpenseBreakdown(config) {
  const breakdown = [];
  const fixed = roundMoney(config.weekly_fixed);
  if (fixed > 0) {
    breakdown.push({ label: 'Weekly fixed overheads', amount: fixed, day_of_week: null });
  }
  for (const p of config.payroll || []) {
    breakdown.push({
      label: p.label || 'Payroll',
      amount: roundMoney(p.amount),
      day_of_week: p.day_of_week != null ? Number(p.day_of_week) : null,
    });
  }
  for (const s of config.supplier_payments || []) {
    breakdown.push({
      label: s.label || 'Supplier',
      amount: roundMoney(s.amount),
      day_of_week: s.day_of_week != null ? Number(s.day_of_week) : null,
    });
  }
  return breakdown;
}

function sumExpenses(breakdown) {
  return roundMoney(sumMoney(breakdown, (x) => x.amount));
}

// ---------------------------------------------------------------------------
// Data fetch (simple SQL; rules in JS)
// ---------------------------------------------------------------------------

async function fetchInvoicesForFacts(db) {
  const r = await db.query(
    `SELECT i.id, i.account_id, i.job_id, i.invoice_number, i.amount, i.invoice_date, i.due_date,
            i.status, i.paid_at,
            j.completed_at AS job_completed_at, j.status AS job_status,
            a.name AS account_name
     FROM invoices i
     LEFT JOIN jobs j ON j.id = i.job_id
     LEFT JOIN accounts a ON a.id = i.account_id`
  );
  return r.rows;
}

async function fetchOpenQuotes(db) {
  const r = await db.query(
    `SELECT q.id, q.opportunity_id, q.amount, q.status, q.sent_at
     FROM quotes q
     WHERE q.sent_at IS NOT NULL
       AND q.sent_at >= NOW() - INTERVAL '60 days'
       AND COALESCE(q.amount, 0) > 0`
  );
  return r.rows.filter((row) => {
    const st = String(row.status || '').trim().toLowerCase();
    if (isPaidStatus(st) || st === 'declined' || st === 'rejected' || st === 'cancelled') return false;
    return OPEN_QUOTE_STATUSES.some((s) => st.includes(s)) || st === '';
  });
}

async function fetchPipelineOpportunities(db) {
  const r = await db.query(
    `SELECT o.id, o.value_estimate, o.stage, o.quote_sent_at, o.updated_at,
            a.name AS account_name
     FROM opportunities o
     LEFT JOIN accounts a ON a.id = o.account_id
     WHERE o.stage = ANY($1::text[])
       AND COALESCE(o.value_estimate, 0) > 0`,
    [PIPELINE_STAGES]
  );
  return r.rows;
}

async function fetchScheduledJobsThisWeek(db, periodStart, periodEnd) {
  const r = await db.query(
    `SELECT j.id, j.account_id, j.job_date, j.status, j.completed_at,
            a.name AS account_name,
            (
              SELECT q.amount FROM quotes q
              WHERE q.job_id = j.id AND COALESCE(q.amount, 0) > 0
              ORDER BY q.sent_at DESC NULLS LAST, q.updated_at DESC
              LIMIT 1
            ) AS quote_amount
     FROM jobs j
     LEFT JOIN accounts a ON a.id = j.account_id
     WHERE j.job_date IS NOT NULL
       AND j.job_date >= $1::date
       AND j.job_date <= $2::date`,
    [periodStart, periodEnd]
  );
  return r.rows;
}

async function fetchUnpaidInvoiceJobIds(db) {
  const r = await db.query(
    `SELECT DISTINCT job_id FROM invoices
     WHERE job_id IS NOT NULL
       AND LOWER(TRIM(COALESCE(status, ''))) != 'paid'
       AND COALESCE(amount, 0) > 0`
  );
  return new Set(r.rows.map((x) => x.job_id));
}

async function fetchDataFreshness(db) {
  let invoices_count = 0;
  let last_sync_hint = null;
  try {
    const c = await db.query(`SELECT COUNT(*)::int AS n FROM invoices`);
    invoices_count = Number(c.rows[0]?.n ?? 0);
  } catch (_) {}
  try {
    const s = await db.query(
      `SELECT finished_at FROM sync_runs
       WHERE status IN ('completed', 'completed_with_errors')
       ORDER BY finished_at DESC NULLS LAST
       LIMIT 1`
    );
    last_sync_hint = s.rows[0]?.finished_at || null;
  } catch (_) {}
  return { invoices_count, last_sync_hint };
}

// ---------------------------------------------------------------------------
// Income (business rules in JS)
// ---------------------------------------------------------------------------

function classifyInvoiceIncome(rows, periodStart, periodEnd) {
  const breakdown = [];
  let highCertainty = 0;
  let possible = 0;

  for (const row of rows) {
    const amount = roundMoney(row.amount);
    if (amount <= 0) continue;

    const paidAtYmd = ymdFromRowDate(row.paid_at);
    const invoiceDateYmd = ymdFromRowDate(row.invoice_date);
    const dueDateYmd = ymdFromRowDate(row.due_date);
    const paidDateForWeek = paidAtYmd || invoiceDateYmd;

    if (isPaidStatus(row.status)) {
      if (paidDateForWeek && isYmdInRange(paidDateForWeek, periodStart, periodEnd)) {
        highCertainty = roundMoney(highCertainty + amount);
        breakdown.push({
          source: 'paid_this_week',
          amount,
          count: 1,
          note: row.invoice_number ? `Invoice ${row.invoice_number}` : String(row.id),
        });
      }
      continue;
    }

    if (!isUnpaidEligible(row)) continue;

    if (dueDateYmd && isYmdInRange(dueDateYmd, periodStart, periodEnd)) {
      highCertainty = roundMoney(highCertainty + amount);
      breakdown.push({
        source: 'due_this_week_unpaid',
        amount,
        count: 1,
        note: row.invoice_number ? `Due ${dueDateYmd}` : null,
      });
      continue;
    }

    if (dueDateYmd && compareYmd(dueDateYmd, periodEnd) > 0) {
      possible = roundMoney(possible + amount);
      breakdown.push({
        source: 'due_after_week_unpaid',
        amount,
        count: 1,
        note: `Due ${dueDateYmd}`,
      });
    }
  }

  return { highCertainty, possibleFromInvoices: possible, breakdown };
}

function applyQuotePossible(quotes, rate) {
  let total = 0;
  const breakdown = [];
  for (const q of quotes) {
    const raw = roundMoney(q.amount);
    const weighted = roundMoney(raw * rate);
    if (weighted <= 0) continue;
    total = roundMoney(total + weighted);
    breakdown.push({
      source: 'open_quotes',
      amount: weighted,
      count: 1,
      note: `Quote ${roundMoney(raw)} × ${rate}`,
    });
  }
  return { total, breakdown };
}

function applyPipelinePossible(opps, quotedOpportunityIds, rate) {
  let total = 0;
  const breakdown = [];
  for (const o of opps) {
    if (quotedOpportunityIds.has(o.id)) continue;
    const raw = roundMoney(o.value_estimate);
    const weighted = roundMoney(raw * rate);
    if (weighted <= 0) continue;
    total = roundMoney(total + weighted);
    breakdown.push({
      source: 'pipeline_quotes',
      amount: weighted,
      count: 1,
      note: o.account_name ? `${o.account_name} (${o.stage})` : o.stage,
    });
  }
  return { total, breakdown };
}

function applyScheduledJobsPossible(jobs, unpaidJobIds, rate) {
  let total = 0;
  const breakdown = [];
  for (const j of jobs) {
    if (unpaidJobIds.has(j.id)) continue;
    const raw = roundMoney(j.quote_amount);
    if (raw <= 0) continue;
    const weighted = roundMoney(raw * rate);
    if (weighted <= 0) continue;
    total = roundMoney(total + weighted);
    breakdown.push({
      source: 'scheduled_jobs',
      amount: weighted,
      count: 1,
      note: j.account_name ? `${j.account_name} job ${j.job_date}` : `Job ${j.job_date}`,
    });
  }
  return { total, breakdown };
}

// ---------------------------------------------------------------------------
// Collections priority (reuses overdue scan)
// ---------------------------------------------------------------------------

function collectionPriorityScore(row, levelTrigger) {
  const days = Number(row.days_overdue) || 0;
  const amount = roundMoney(row.amount);
  const level = String(row.overdue_level || 'none').toLowerCase();
  let score = days * 10 + amount / 500;
  if (levelTrigger) score += 40;
  if (level === OVERDUE_LEVEL.DAYS_7) score += 20;
  if (level === OVERDUE_LEVEL.DAYS_14) score += 30;
  return roundMoney(score);
}

function buildCollectionReason(row, levelTrigger) {
  const parts = [`${row.days_overdue} days overdue`];
  if (levelTrigger) parts.push(`trigger ${levelTrigger}`);
  if (row.overdue_level && row.overdue_level !== 'none') parts.push(`level ${row.overdue_level}`);
  return parts.join('; ');
}

async function buildTopInvoices(db) {
  const rows = await scanOverdueInvoices({ db });
  const ranked = rows
    .map((row) => {
      const levelTrigger = getLevelToTrigger(row);
      return {
        invoice_id: row.invoice_id,
        invoice_number: row.invoice_number || null,
        customer: row.contact_name || null,
        amount: roundMoney(row.amount),
        days_overdue: Number(row.days_overdue) || 0,
        level_trigger: levelTrigger,
        overdue_level: row.overdue_level || 'none',
        priority_score: collectionPriorityScore(row, levelTrigger),
        reason: buildCollectionReason(row, levelTrigger),
      };
    })
    .sort((a, b) => b.priority_score - a.priority_score)
    .slice(0, TOP_INVOICE_LIMIT);

  return ranked;
}

function sumOverdueAmount(overdueRows) {
  return roundMoney(sumMoney(overdueRows, (r) => r.amount));
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Collect deterministic cashflow facts for one Adelaide calendar day.
 * @param {object} [options]
 * @param {import('pg').Pool|import('pg').PoolClient} [options.db]
 * @param {string} [options.snapshotDate] — YYYY-MM-DD Adelaide; default today
 * @param {Date} [options.referenceDate] — for tests (converted to Adelaide YMD)
 */
async function collectCashflowFacts(options = {}) {
  const db = options.db || pool;
  const snapshotYmd = options.snapshotDate || getAdelaideYmd(options.referenceDate || new Date());
  const week = getAdelaideWeekBounds(snapshotYmd);
  const { config, config_source } = await loadWeeklyConfig();

  const quoteRate = Number(config.quote_conversion_rate) || 0.35;
  const pipelineRate = Number(config.pipeline_conversion_rate) || 0.25;
  const scheduledRate = Number(config.scheduled_job_conversion_rate) || 0.5;

  const [
    invoiceRows,
    openQuotes,
    pipelineOpps,
    scheduledJobs,
    unpaidJobIds,
    overdueRows,
    topInvoices,
    freshness,
  ] = await Promise.all([
    fetchInvoicesForFacts(db),
    fetchOpenQuotes(db),
    fetchPipelineOpportunities(db),
    fetchScheduledJobsThisWeek(db, week.period_start, week.period_end),
    fetchUnpaidInvoiceJobIds(db),
    scanOverdueInvoices({ db }),
    buildTopInvoices(db),
    fetchDataFreshness(db),
  ]);

  const incomeFromInvoices = classifyInvoiceIncome(invoiceRows, week.period_start, week.period_end);
  const quotedOpportunityIds = new Set(
    openQuotes.map((q) => q.opportunity_id).filter(Boolean)
  );

  const quotePossible = applyQuotePossible(openQuotes, quoteRate);
  const pipelinePossible = applyPipelinePossible(pipelineOpps, quotedOpportunityIds, pipelineRate);
  const jobsPossible = applyScheduledJobsPossible(scheduledJobs, unpaidJobIds, scheduledRate);

  const possible = roundMoney(
    incomeFromInvoices.possibleFromInvoices +
      quotePossible.total +
      pipelinePossible.total +
      jobsPossible.total
  );

  const highCertainty = incomeFromInvoices.highCertainty;
  const expectedTotal = roundMoney(highCertainty + possible);

  const incomeBreakdown = [
    ...incomeFromInvoices.breakdown,
    ...quotePossible.breakdown,
    ...pipelinePossible.breakdown,
    ...jobsPossible.breakdown,
  ];

  const expenseBreakdown = buildExpenseBreakdown(config);
  const configExpensesTotal = sumExpenses(expenseBreakdown);

  let bankAgg = null;
  try {
    bankAgg = await aggregateBankCashflow({
      db,
      snapshotDate: week.snapshot_date,
      periodStart: week.period_start,
      periodEnd: week.period_end,
      runDetection: true,
    });
  } catch (_) {
    bankAgg = { has_bank_data: false };
  }

  const hasBank = Boolean(bankAgg?.has_bank_data);
  const actualWeekOutflow = roundMoney(bankAgg?.actual_week_outflow || 0);
  let expenseSource = 'config';
  let effectiveExpensesTotal = configExpensesTotal;

  if (hasBank && actualWeekOutflow > 0) {
    if (actualWeekOutflow >= configExpensesTotal) {
      expenseSource = 'bank';
      effectiveExpensesTotal = actualWeekOutflow;
    } else {
      expenseSource = 'hybrid';
      effectiveExpensesTotal = roundMoney(
        Math.max(actualWeekOutflow, configExpensesTotal)
      );
    }
  }

  const gapConservative = roundMoney(highCertainty - effectiveExpensesTotal);
  const gapOptimistic = roundMoney(expectedTotal - effectiveExpensesTotal);
  const hasGap = gapConservative < 0;
  const gapAmount = hasGap ? roundMoney(Math.abs(gapConservative)) : 0;

  const obligations = hasBank
    ? {
        recurring_next_7d: roundMoney(bankAgg.recurring_next_7d),
        recurring_next_14d: roundMoney(bankAgg.recurring_next_14d),
        upcoming_7d: bankAgg.recurring_upcoming_7d || [],
        upcoming_14d: bankAgg.recurring_upcoming_14d || [],
        upcoming_payroll: bankAgg.upcoming_payroll || [],
        supplier_30d_total: roundMoney(bankAgg.supplier_30d_total),
        payroll_30d_total: roundMoney(bankAgg.payroll_30d_total),
        top_supplier_pressure: bankAgg.top_supplier_pressure,
        active_recurring_count: bankAgg.active_recurring_count || 0,
        patterns: bankAgg.recurring_patterns || [],
      }
    : {
        recurring_next_7d: 0,
        recurring_next_14d: 0,
        upcoming_7d: [],
        upcoming_14d: [],
        upcoming_payroll: [],
        supplier_30d_total: 0,
        payroll_30d_total: 0,
        top_supplier_pressure: null,
        active_recurring_count: 0,
        patterns: [],
      };

  const liquidity = hasBank
    ? {
        actual_week_inflow: roundMoney(bankAgg.actual_week_inflow),
        actual_week_outflow: actualWeekOutflow,
        net_week_from_bank: roundMoney(
          bankAgg.actual_week_inflow - actualWeekOutflow
        ),
      }
    : {
        actual_week_inflow: 0,
        actual_week_outflow: 0,
        net_week_from_bank: 0,
      };

  const facts = {
    meta: {
      snapshot_date: week.snapshot_date,
      period_start: week.period_start,
      period_end: week.period_end,
      timezone: TIMEZONE,
      currency: CURRENCY,
      generated_at: new Date().toISOString(),
      config_source,
      data_freshness: freshness,
    },
    income: {
      high_certainty: highCertainty,
      possible,
      expected_total: expectedTotal,
      breakdown: incomeBreakdown,
    },
    overdue: {
      total_amount: sumOverdueAmount(overdueRows),
      count: overdueRows.length,
    },
    collections: {
      top_invoices: topInvoices,
    },
    expenses: {
      expected_total: configExpensesTotal,
      effective_total: effectiveExpensesTotal,
      source: expenseSource,
      breakdown: expenseBreakdown,
      actual_from_bank: hasBank
        ? {
            week_outflow: actualWeekOutflow,
            week_inflow: roundMoney(bankAgg.actual_week_inflow),
            supplier_30d_total: roundMoney(bankAgg.supplier_30d_total),
            payroll_30d_total: roundMoney(bankAgg.payroll_30d_total),
            top_outflows: bankAgg.top_outflows || [],
          }
        : null,
    },
    obligations,
    liquidity,
    cashflow: {
      gap_conservative: gapConservative,
      gap_optimistic: gapOptimistic,
      has_gap: hasGap,
      gap_amount: gapAmount,
      expense_basis: expenseSource,
    },
  };

  return facts;
}

module.exports = {
  collectCashflowFacts,
  roundMoney,
  getAdelaideYmd,
  getAdelaideWeekBounds,
  addDaysYmd,
  isYmdInRange,
  loadWeeklyConfig,
  CURRENCY,
  TIMEZONE,
};
