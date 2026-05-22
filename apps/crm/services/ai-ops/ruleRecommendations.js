/**
 * Rule-based cashflow narrative (Phase 1A PR3). No LLM.
 * Output shape matches future LLM schema for drop-in replacement.
 */

const { roundMoney } = require('./cashflowFacts');
const { enrichRisksWithAttention } = require('./cashflowAttention');

function fmtAud(amount) {
  const n = roundMoney(amount);
  return (
    '$' +
    n.toLocaleString('en-AU', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  );
}

function nextPriority(counter) {
  return counter.n++;
}

/**
 * @param {object} facts — from collectCashflowFacts()
 * @returns {{ ai_summary: string, recommendations: Array, risks: Array }}
 */
function buildRuleInsights(facts) {
  const recommendations = [];
  const risks = [];
  const pri = { n: 1 };

  const income = facts.income || {};
  const cashflow = facts.cashflow || {};
  const overdue = facts.overdue || {};
  const topInvoices = facts.collections?.top_invoices || [];
  const expenses = facts.expenses || {};
  const meta = facts.meta || {};

  const highCert = roundMoney(income.high_certainty);
  const possible = roundMoney(income.possible);
  const expectedTotal = roundMoney(income.expected_total);
  const expensesTotal = roundMoney(
    expenses.effective_total != null ? expenses.effective_total : expenses.expected_total
  );
  const configExpenses = roundMoney(expenses.expected_total);
  const obligations = facts.obligations || {};
  const liquidity = facts.liquidity || {};
  const overdueTotal = roundMoney(overdue.total_amount);
  const gapAmount = roundMoney(cashflow.gap_amount);

  // --- Risks ---

  if (cashflow.has_gap) {
    risks.push({
      code: 'cash_gap',
      severity: 'high',
      message: `Conservative cash position shows a ${fmtAud(gapAmount)} shortfall this week (high-certainty income ${fmtAud(highCert)} vs expected expenses ${fmtAud(expensesTotal)}).`,
    });
  }

  if (overdueTotal > 10000) {
    risks.push({
      code: 'collections_pressure',
      severity: overdueTotal > 20000 ? 'high' : 'medium',
      message: `Overdue receivables total ${fmtAud(overdueTotal)} across ${overdue.count || 0} invoice(s).`,
    });
  }

  if (possible > 0 && highCert > 0 && possible > highCert * 2) {
    risks.push({
      code: 'income_uncertainty',
      severity: 'medium',
      message: `Possible income (${fmtAud(possible)}) is more than double high-certainty income (${fmtAud(highCert)}).`,
    });
  }

  if ((meta.data_freshness?.invoices_count || 0) > 0 && !meta.data_freshness?.last_sync_hint) {
    risks.push({
      code: 'stale_sync',
      severity: 'low',
      message: 'No recent ServiceM8 sync run recorded; invoice figures may be stale.',
    });
  }

  const next7 = roundMoney(obligations.recurring_next_7d);
  if (next7 > 0 && next7 >= highCert * 0.4 && highCert > 0) {
    risks.push({
      code: 'upcoming_obligations_7d',
      severity: next7 > highCert ? 'high' : 'medium',
      message: `Recurring obligations due in 7 days total ${fmtAud(next7)} (vs high-certainty income ${fmtAud(highCert)}).`,
    });
  } else if (next7 > 5000) {
    risks.push({
      code: 'upcoming_obligations_7d',
      severity: 'medium',
      message: `Recurring obligations due in 7 days total ${fmtAud(next7)}.`,
    });
  }

  const supplier30 = roundMoney(obligations.supplier_30d_total);
  if (supplier30 > 15000 || (supplier30 > 8000 && highCert > 0 && supplier30 > highCert)) {
    risks.push({
      code: 'supplier_pressure',
      severity: supplier30 > 25000 ? 'high' : 'medium',
      message: `Supplier outflows last 30 days: ${fmtAud(supplier30)}${obligations.top_supplier_pressure?.counterparty_key ? ` (top: ${obligations.top_supplier_pressure.counterparty_key})` : ''}.`,
    });
  }

  const payroll30 = roundMoney(obligations.payroll_30d_total);
  const upcomingPayroll = obligations.upcoming_payroll || [];
  if (upcomingPayroll.length > 0) {
    const nextPay = upcomingPayroll[0];
    risks.push({
      code: 'payroll_pressure',
      severity: 'medium',
      message: `Payroll rhythm detected — next expected ${nextPay.next_expected_date || 'soon'} (${fmtAud(Math.abs(nextPay.typical_amount))} ${nextPay.cadence || ''}).`,
    });
  } else if (payroll30 > 10000) {
    risks.push({
      code: 'payroll_pressure',
      severity: 'medium',
      message: `Payroll outflows last 30 days: ${fmtAud(payroll30)}.`,
    });
  }

  // --- Recommendations ---

  if (cashflow.has_gap) {
    recommendations.push({
      priority: nextPriority(pri),
      category: 'cashflow',
      text: `Reserve ${fmtAud(gapAmount)} or reduce outflows — conservative weekly gap is ${fmtAud(cashflow.gap_conservative)}.`,
    });
    if (topInvoices.length > 0) {
      recommendations.push({
        priority: nextPriority(pri),
        category: 'collections',
        text: 'Prioritise chasing overdue invoices before new work — see top collection targets below.',
      });
    }
  }

  if (topInvoices.length > 0) {
    const lines = topInvoices.slice(0, 3).map((inv, i) => {
      const num = inv.invoice_number || inv.invoice_id;
      const who = inv.customer || 'customer';
      return `${i + 1}) ${who} — ${num} (${fmtAud(inv.amount)}, ${inv.days_overdue}d overdue)`;
    });
    recommendations.push({
      priority: nextPriority(pri),
      category: 'collections',
      text: `Today: follow up on top invoice(s): ${lines.join('; ')}.`,
    });
  }

  if (overdueTotal > 10000 && !recommendations.some((r) => r.category === 'collections' && r.text.includes('overdue'))) {
    recommendations.push({
      priority: nextPriority(pri),
      category: 'collections',
      text: `Overdue total is ${fmtAud(overdueTotal)} — review Admin 催款管理 and send reminders for eligible invoices.`,
    });
  }

  if (possible > 0 && highCert > 0 && possible > highCert * 2) {
    recommendations.push({
      priority: nextPriority(pri),
      category: 'pipeline',
      text: 'Income uncertainty is high — focus on quote follow-ups and moving decision_pending opportunities to won.',
    });
  }

  const payrollLines = (expenses.breakdown || []).filter((line) =>
    /wage|payroll|salary/i.test(String(line.label || ''))
  );
  if (payrollLines.length > 0) {
    const payrollTotal = roundMoney(sumBreakdown(payrollLines));
    const labels = payrollLines.map((l) => l.label).join(', ');
    recommendations.push({
      priority: nextPriority(pri),
      category: 'payroll',
      text: `Keep ${fmtAud(payrollTotal)} aside for payroll (${labels}) before committing to discretionary spend.`,
    });
  }

  if (next7 > 0) {
    recommendations.push({
      priority: nextPriority(pri),
      category: 'obligations',
      text: `Set aside ${fmtAud(next7)} for recurring obligations due in the next 7 days.`,
    });
  }

  if (expenses.actual_from_bank && liquidity.actual_week_outflow > 0) {
    recommendations.push({
      priority: nextPriority(pri),
      category: 'cashflow',
      text: `Bank actual outflow this week ${fmtAud(liquidity.actual_week_outflow)} (basis: ${expenses.source || 'config'}${configExpenses !== expensesTotal ? `, config ${fmtAud(configExpenses)}` : ''}).`,
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      priority: 1,
      category: 'operations',
      text: 'No critical cashflow flags this week — maintain quote follow-up rhythm and monitor overdue invoices.',
    });
  }

  // Cap at 5, sort by priority
  const trimmedRecs = recommendations
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5)
    .map((r, i) => ({ ...r, priority: i + 1 }));

  const trimmedRisks = enrichRisksWithAttention(facts, risks.slice(0, 6));

  const ai_summary = buildSummary({
    meta,
    highCert,
    possible,
    expectedTotal,
    expensesTotal,
    cashflow,
    overdueTotal,
    overdueCount: overdue.count || 0,
    topInvoices,
    trimmedRisks,
  });

  return {
    ai_summary,
    recommendations: trimmedRecs,
    risks: trimmedRisks,
  };
}

function sumBreakdown(lines) {
  let t = 0;
  for (const line of lines) t += roundMoney(line.amount);
  return t;
}

function buildSummary(ctx) {
  const parts = [];
  const week = ctx.meta.period_start && ctx.meta.period_end
    ? `Week ${ctx.meta.period_start} to ${ctx.meta.period_end}`
    : 'This week';

  parts.push(
    `${week}: high-certainty income ${fmtAud(ctx.highCert)}, possible ${fmtAud(ctx.possible)} (total expected ${fmtAud(ctx.expectedTotal)}).`
  );
  parts.push(`Expected expenses ${fmtAud(ctx.expensesTotal)}.`);

  if (ctx.cashflow.has_gap) {
    const gap = roundMoney(ctx.cashflow.gap_amount);
    parts.push(
      `Conservative cash gap of ${fmtAud(gap)} — plan collections or delay non-essential outflows.`
    );
  } else {
    parts.push('Conservative cash position is balanced or positive for the week.');
  }

  if (ctx.overdueTotal > 0) {
    parts.push(`Overdue receivables: ${fmtAud(ctx.overdueTotal)} (${ctx.overdueCount} invoice(s)).`);
  }

  if (ctx.topInvoices.length > 0) {
    const first = ctx.topInvoices[0];
    const num = first.invoice_number || 'invoice';
    const who = first.customer || 'customer';
    parts.push(`Top collection target: ${who}, ${num} (${fmtAud(first.amount)}).`);
  }

  return parts.join(' ');
}

module.exports = {
  buildRuleInsights,
  fmtAud,
};
