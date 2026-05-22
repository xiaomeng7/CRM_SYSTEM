#!/usr/bin/env node
/**
 * Print Cashflow Facts Engine output (no LLM, no DB writes).
 *
 * Usage (from repo root):
 *   pnpm --filter @bht/crm run test:cashflow-facts
 *
 * Optional:
 *   SNAPSHOT_DATE=2026-05-22 pnpm --filter @bht/crm run test:cashflow-facts
 */

require('../lib/load-env');
const { pool } = require('../lib/db');
const { collectCashflowFacts } = require('../services/ai-ops/cashflowFacts');

async function main() {
  const snapshotDate = process.env.SNAPSHOT_DATE || undefined;
  const facts = await collectCashflowFacts({ snapshotDate });

  console.log('\n=== Cashflow Facts Summary ===\n');
  console.log('Snapshot date:', facts.meta.snapshot_date);
  console.log('Week:', facts.meta.period_start, '→', facts.meta.period_end, `(${facts.meta.timezone})`);
  console.log('Config source:', facts.meta.config_source);
  console.log('');
  console.log('Income high certainty:  ', fmt(facts.income.high_certainty));
  console.log('Income possible:        ', fmt(facts.income.possible));
  console.log('Income expected total:  ', fmt(facts.income.expected_total));
  console.log('');
  console.log('Overdue total:          ', fmt(facts.overdue.total_amount), `(${facts.overdue.count} invoices)`);
  console.log('');
  console.log('Expenses expected:      ', fmt(facts.expenses.expected_total));
  console.log('Gap (conservative):     ', fmt(facts.cashflow.gap_conservative));
  console.log('Gap (optimistic):       ', fmt(facts.cashflow.gap_optimistic));
  console.log('Has gap:                ', facts.cashflow.has_gap);
  console.log('Gap amount:             ', fmt(facts.cashflow.gap_amount));
  console.log('');

  console.log('=== Top invoices to chase ===\n');
  if (!facts.collections.top_invoices.length) {
    console.log('(none)');
  } else {
    facts.collections.top_invoices.forEach((inv, i) => {
      console.log(
        `${i + 1}. #${inv.invoice_number || inv.invoice_id} ${inv.customer || '—'} ` +
          `$${inv.amount} ${inv.days_overdue}d overdue score=${inv.priority_score} ` +
          `trigger=${inv.level_trigger || '-'}`
      );
      console.log(`   ${inv.reason}`);
    });
  }

  console.log('\n=== Income breakdown ===\n');
  if (!facts.income.breakdown.length) {
    console.log('(empty)');
  } else {
    facts.income.breakdown.forEach((line) => {
      console.log(`- ${line.source}: $${line.amount}${line.note ? ` (${line.note})` : ''}`);
    });
  }

  console.log('\n=== Expense breakdown ===\n');
  facts.expenses.breakdown.forEach((line) => {
    console.log(`- ${line.label}: $${line.amount}`);
  });

  console.log('\n=== Full facts JSON ===\n');
  console.log(JSON.stringify(facts, null, 2));
}

function fmt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return '$' + x.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error(e);
    pool.end();
    process.exit(1);
  });
