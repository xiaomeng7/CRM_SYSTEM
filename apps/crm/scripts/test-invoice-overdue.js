#!/usr/bin/env node
/**
 * Test Invoice Overdue Automation: scan only or full run in dry-run.
 *
 * Usage (from apps/crm):
 *   node scripts/test-invoice-overdue.js           # scan only, list overdue invoices
 *   node scripts/test-invoice-overdue.js --run     # run automation in dry-run (no writes, no SMS)
 */

require('../lib/load-env');
const { pool } = require('../lib/db');
const {
  scanOverdueInvoices,
  getLevelToTrigger,
  runOverdueScan,
} = require('../services/invoiceOverdueAutomation');

const runDry = process.argv.includes('--run');

async function main() {
  if (runDry) {
    console.log('Running overdue scan (dry-run, no SMS)...');
    const out = await runOverdueScan({ dryRun: true, sendSms: false, log: console.log });
    console.log('Processed:', out.processed);
    console.log('Results:', JSON.stringify(out.results, null, 2));
    return;
  }

  const rows = await scanOverdueInvoices();
  console.log('Overdue invoices (unpaid, past due):', rows.length);
  rows.forEach((r, i) => {
    const level = getLevelToTrigger(r);
    console.log(
      `${i + 1}. invoice_id=${r.invoice_id} invoice_number=${r.invoice_number} due_date=${r.due_date} days_overdue=${r.days_overdue} overdue_level=${r.overdue_level} -> trigger=${level || '-'} contact=${r.contact_id || '-'}`
    );
  });
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('test-invoice-overdue failed:', err);
    process.exit(1);
  });
