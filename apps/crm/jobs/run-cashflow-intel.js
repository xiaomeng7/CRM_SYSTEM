#!/usr/bin/env node
/**
 * Daily Cashflow Intelligence job (Railway Cron).
 *
 * Usage:
 *   node jobs/run-cashflow-intel.js
 *   node jobs/run-cashflow-intel.js --force
 *   node jobs/run-cashflow-intel.js --dry-run
 *   node jobs/run-cashflow-intel.js --date=2026-05-22
 */

require('../lib/load-env');
const { pool } = require('../lib/db');
const { runCashflowIntelligence } = require('../services/ai-ops/cashflowIntelligenceAssistant');

function parseArgs(argv) {
  const out = { force: false, dryRun: false, snapshotDate: null };
  for (const arg of argv) {
    if (arg === '--force') out.force = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg.startsWith('--date=')) out.snapshotDate = arg.slice('--date='.length).trim();
  }
  return out;
}

function fmtMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return '$' + x.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    '[cashflow-intel] start force=%s dry_run=%s date=%s',
    args.force,
    args.dryRun,
    args.snapshotDate || '(today Adelaide)'
  );

  const result = await runCashflowIntelligence({
    force: args.force,
    dryRun: args.dryRun,
    snapshotDate: args.snapshotDate || undefined,
    log: console.log,
  });

  console.log('\n=== Result ===');
  console.log('run_id:     ', result.run_id);
  console.log('status:     ', result.status);
  console.log('snapshot_id:', result.snapshot_id || '(none)');
  console.log('degraded:   ', result.degraded);
  if (result.reason) console.log('reason:     ', result.reason);
  if (result.error) console.log('error:      ', result.error);

  if (result.summary) {
    console.log('\n=== Key numbers ===');
    console.log('high_certainty:   ', fmtMoney(result.summary.high_certainty));
    console.log('possible:         ', fmtMoney(result.summary.possible));
    console.log('expected_expenses:', fmtMoney(result.summary.expected_expenses));
    console.log('gap_amount:       ', fmtMoney(result.summary.gap_amount));
    console.log('has_gap:          ', result.summary.has_gap);
  }

  if (result.insights) {
    console.log('\n=== AI summary (rules) ===\n');
    console.log(result.insights.ai_summary);
    console.log('\n=== Recommendations ===\n');
    for (const rec of result.insights.recommendations) {
      console.log(`[${rec.priority}] ${rec.category}: ${rec.text}`);
    }
    if (result.insights.risks.length) {
      console.log('\n=== Risks ===\n');
      for (const risk of result.insights.risks) {
        console.log(`[${risk.severity}] ${risk.code}: ${risk.message}`);
      }
    }
  }

  if (result.status === 'failed') {
    process.exitCode = 1;
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('[cashflow-intel] fatal:', err);
    pool.end();
    process.exit(1);
  });
