/**
 * Cashflow Intelligence API — read snapshots, trigger daily run.
 * @see docs/cashflow-intelligence-phase1a.md (when added)
 */

const router = require('express').Router();
const { pool } = require('../../lib/db');
const { roundMoney } = require('../../services/ai-ops/cashflowFacts');
const {
  enrichRisksWithAttention,
  buildOperationalHealth,
} = require('../../services/ai-ops/cashflowAttention');
const { runCashflowIntelligence } = require('../../services/ai-ops/cashflowIntelligenceAssistant');

const MAX_HISTORY_LIMIT = 30;
const DEFAULT_HISTORY_LIMIT = 7;

function safeErrorMessage(err) {
  if (!err) return 'Request failed';
  const msg = String(err.message || err);
  if (/relation .* does not exist/i.test(msg)) {
    return 'Database migration required (063_cashflow_intelligence)';
  }
  if (/password|connection|ECONNREFUSED/i.test(msg)) {
    return 'Database unavailable';
  }
  return 'Request failed';
}

function requireAdminSecret(req, res) {
  const secret = process.env.SYNC_SECRET || process.env.ADMIN_SECRET;
  if (!secret) return true;
  const provided =
    req.headers['x-admin-secret'] ||
    req.headers['x-sync-secret'] ||
    req.body?.sync_secret ||
    req.body?.admin_secret;
  if (provided !== secret) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}

function parseJsonField(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function normalizeFacts(facts) {
  const f = facts || {};
  const income = f.income || {};
  const expenses = f.expenses || {};
  const cashflow = f.cashflow || {};
  const overdue = f.overdue || {};

  return {
    ...f,
    income: {
      ...income,
      high_certainty: roundMoney(income.high_certainty),
      possible: roundMoney(income.possible),
      expected_total: roundMoney(income.expected_total),
    },
    expenses: {
      ...expenses,
      expected_total: roundMoney(expenses.expected_total),
      effective_total: roundMoney(expenses.effective_total),
    },
    obligations: f.obligations || {},
    liquidity: f.liquidity
      ? {
          ...f.liquidity,
          actual_week_inflow: roundMoney(f.liquidity.actual_week_inflow),
          actual_week_outflow: roundMoney(f.liquidity.actual_week_outflow),
          net_week_from_bank: roundMoney(f.liquidity.net_week_from_bank),
        }
      : {},
    cashflow: {
      ...cashflow,
      gap_conservative: roundMoney(cashflow.gap_conservative),
      gap_optimistic: roundMoney(cashflow.gap_optimistic),
      gap_amount: roundMoney(cashflow.gap_amount),
      has_gap: Boolean(cashflow.has_gap),
    },
    overdue: {
      ...overdue,
      total_amount: roundMoney(overdue.total_amount),
      count: Number(overdue.count) || 0,
    },
  };
}

function formatSnapshotRow(row) {
  const facts = normalizeFacts(parseJsonField(row.facts, {}));
  const recommendations = parseJsonField(row.recommendations, []);
  const rawRisks = parseJsonField(row.risks, []);
  const risks = enrichRisksWithAttention(facts, rawRisks);
  const operational_health = buildOperationalHealth(facts, risks);

  return {
    id: row.id,
    snapshot_date: row.snapshot_date,
    period_start: row.period_start,
    period_end: row.period_end,
    facts,
    ai_summary: row.ai_summary || null,
    recommendations: Array.isArray(recommendations) ? recommendations : [],
    risks,
    operational_health,
    metadata: {
      run_id: row.run_id || null,
      created_at: row.created_at,
      currency: facts.meta?.currency || 'AUD',
      timezone: facts.meta?.timezone || 'Australia/Adelaide',
      config_source: facts.meta?.config_source || null,
      generated_at: facts.meta?.generated_at || null,
      data_freshness: facts.meta?.data_freshness || null,
    },
  };
}

function formatHistoryRow(row) {
  const facts = normalizeFacts(parseJsonField(row.facts, {}));
  return {
    id: row.id,
    snapshot_date: row.snapshot_date,
    period_start: row.period_start,
    period_end: row.period_end,
    high_certainty: facts.income.high_certainty,
    possible: facts.income.possible,
    expenses: facts.expenses.expected_total,
    gap_amount: facts.cashflow.gap_amount,
    has_gap: facts.cashflow.has_gap,
    operational_health: buildOperationalHealth(
      facts,
      enrichRisksWithAttention(facts, parseJsonField(row.risks, []))
    ),
    created_at: row.created_at,
  };
}

router.get('/latest', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, snapshot_date, period_start, period_end, facts,
              ai_summary, recommendations, risks, run_id, created_at
       FROM financial_snapshots
       ORDER BY snapshot_date DESC, created_at DESC
       LIMIT 1`
    );
    if (!r.rows.length) {
      return res.json({ ok: true, snapshot: null });
    }
    res.json({ ok: true, snapshot: formatSnapshotRow(r.rows[0]) });
  } catch (err) {
    console.error('[cashflow-intel] GET /latest', err.message);
    res.status(500).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.get('/history', async (req, res) => {
  try {
    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_HISTORY_LIMIT;
    if (limit > MAX_HISTORY_LIMIT) limit = MAX_HISTORY_LIMIT;

    const r = await pool.query(
      `SELECT id, snapshot_date, period_start, period_end, facts, risks, created_at
       FROM financial_snapshots
       ORDER BY snapshot_date DESC
       LIMIT $1`,
      [limit]
    );

    res.json({
      ok: true,
      limit,
      items: r.rows.map(formatHistoryRow),
    });
  } catch (err) {
    console.error('[cashflow-intel] GET /history', err.message);
    res.status(500).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.post('/run', async (req, res) => {
  if (!requireAdminSecret(req, res)) return;

  try {
    const body = req.body || {};
    const force = body.force === true || body.force === 'true' || body.force === 1;
    const dryRun = body.dry_run === true || body.dry_run === 'true' || body.dry_run === 1;
    const snapshotDate =
      typeof body.snapshot_date === 'string' && body.snapshot_date.trim()
        ? body.snapshot_date.trim()
        : undefined;

    const result = await runCashflowIntelligence({
      force,
      dryRun,
      snapshotDate,
      log: (msg) => console.log('[cashflow-intel-api]', msg),
    });

    const statusCode = result.status === 'failed' ? 500 : 200;
    res.status(statusCode).json({
      ok: result.status !== 'failed',
      run_id: result.run_id,
      snapshot_id: result.snapshot_id,
      status: result.status,
      degraded: result.degraded === true,
      reason: result.reason || null,
      error: result.error || null,
      summary: result.summary || null,
    });
  } catch (err) {
    console.error('[cashflow-intel] POST /run', err.message);
    res.status(500).json({ ok: false, error: safeErrorMessage(err) });
  }
});

module.exports = router;
