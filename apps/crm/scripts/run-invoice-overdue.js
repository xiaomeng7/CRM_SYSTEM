#!/usr/bin/env node
/**
 * Invoice Overdue Automation — daily job.
 * Scans unpaid invoices past due_date, triggers level 3 / 7 / 14 (task, SMS, payment_risk, audit).
 *
 * Usage (from apps/crm):
 *   node scripts/run-invoice-overdue.js           # run with SMS
 *   node scripts/run-invoice-overdue.js --dry-run  # no DB writes, no SMS
 *   node scripts/run-invoice-overdue.js --no-sms   # run but skip sending SMS
 */

require('../lib/load-env');
const { pool } = require('../lib/db');
const { runOverdueScan } = require('../services/invoiceOverdueAutomation');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sendSms = !args.includes('--no-sms');

async function main() {
  console.log('Invoice overdue automation (dryRun=%s, sendSms=%s)', dryRun, sendSms);
  const out = await runOverdueScan({ dryRun, sendSms, log: console.log });
  console.log('Done. Processed:', out.processed);
  if (out.results?.length) {
    out.results.forEach((r) => {
      const line = [r.invoice_id, r.level, 'task=', r.task_created, 'sms=', r.sms_sent];
      if (r.error) line.push('error=' + r.error);
      console.log(' ', ...line);
    });
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('run-invoice-overdue failed:', err);
    process.exit(1);
  });
