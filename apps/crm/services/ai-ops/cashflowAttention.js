/**
 * Operational attention scoring (0–100) for cashflow intelligence.
 */

const { roundMoney } = require('./cashflowFacts');

function clampScore(n) {
  const x = Math.round(Number(n) || 0);
  return Math.min(100, Math.max(0, x));
}

/**
 * Aggregate attention score from facts (founder daily danger meter).
 */
function computeAttentionScore(facts) {
  if (!facts) return 0;

  const cashflow = facts.cashflow || {};
  const income = facts.income || {};
  const overdue = facts.overdue || {};
  const expenses = facts.expenses || {};
  const obligations = facts.obligations || {};
  const top0 = facts.collections?.top_invoices?.[0];

  const highCert = roundMoney(income.high_certainty);
  const possible = roundMoney(income.possible);
  const expensesTotal = roundMoney(
    expenses.effective_total != null ? expenses.effective_total : expenses.expected_total
  );
  const overdueTotal = roundMoney(overdue.total_amount);

  let score = 0;

  if (cashflow.has_gap) score += 40;
  if (overdueTotal > 30000) score += 40;
  else if (overdueTotal > 10000) score += 20;
  if (top0 && roundMoney(top0.amount) > 5000) score += 15;
  if (highCert < expensesTotal) score += 30;
  if (possible > 0 && highCert > 0 && possible > highCert * 2) score += 15;
  const next7 = roundMoney(obligations.recurring_next_7d);
  if (next7 > 5000) score += 15;
  if (next7 > highCert && highCert > 0) score += 20;

  return clampScore(score);
}

function attentionScoreForRiskCode(code, facts) {
  const cashflow = facts.cashflow || {};
  const income = facts.income || {};
  const overdue = facts.overdue || {};
  const expenses = facts.expenses || {};
  const top0 = facts.collections?.top_invoices?.[0];

  const highCert = roundMoney(income.high_certainty);
  const possible = roundMoney(income.possible);
  const expensesTotal = roundMoney(
    expenses.effective_total != null ? expenses.effective_total : expenses.expected_total
  );
  const overdueTotal = roundMoney(overdue.total_amount);

  switch (code) {
    case 'cash_gap': {
      let s = 0;
      if (cashflow.has_gap) s += 40;
      if (highCert < expensesTotal) s += 30;
      return clampScore(s);
    }
    case 'collections_pressure': {
      let s = 0;
      if (overdueTotal > 30000) s += 40;
      else if (overdueTotal > 10000) s += 20;
      if (top0 && roundMoney(top0.amount) > 5000) s += 15;
      return clampScore(s);
    }
    case 'income_uncertainty':
      return possible > 0 && highCert > 0 && possible > highCert * 2 ? 15 : 0;
    case 'stale_sync':
      return 10;
    case 'upcoming_obligations_7d': {
      const next7 = roundMoney((facts.obligations || {}).recurring_next_7d);
      let s = 0;
      if (next7 > 5000) s += 15;
      if (next7 > highCert && highCert > 0) s += 20;
      return clampScore(s);
    }
    case 'supplier_pressure': {
      const s30 = roundMoney((facts.obligations || {}).supplier_30d_total);
      if (s30 > 25000) return 25;
      if (s30 > 15000) return 15;
      return 10;
    }
    case 'payroll_pressure':
      return 15;
    default:
      return 0;
  }
}

/**
 * @param {object} facts
 * @param {Array} risks
 * @returns {Array}
 */
function enrichRisksWithAttention(facts, risks) {
  const list = Array.isArray(risks) ? risks : [];
  return list.map((risk) => ({
    code: risk.code,
    severity: risk.severity,
    message: risk.message,
    attention_score: clampScore(
      risk.attention_score != null
        ? risk.attention_score
        : attentionScoreForRiskCode(risk.code, facts)
    ),
  }));
}

/**
 * @param {object} facts
 * @param {Array} [risks] — enriched risks optional for max()
 */
function buildOperationalHealth(facts, risks) {
  const aggregate = computeAttentionScore(facts);
  const fromRisks = Array.isArray(risks) && risks.length
    ? Math.max(...risks.map((r) => clampScore(r.attention_score)))
    : 0;
  const attention_score = clampScore(Math.max(aggregate, fromRisks));

  let status = 'healthy';
  if (attention_score >= 80) status = 'critical';
  else if (attention_score >= 50) status = 'warning';

  return { status, attention_score };
}

module.exports = {
  computeAttentionScore,
  attentionScoreForRiskCode,
  enrichRisksWithAttention,
  buildOperationalHealth,
  clampScore,
};
