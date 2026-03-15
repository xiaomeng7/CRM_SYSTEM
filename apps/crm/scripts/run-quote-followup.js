#!/usr/bin/env node
/**
 * Quote 7-day follow-up runner. Run via cron (e.g. daily).
 * Usage: node scripts/run-quote-followup.js [--dry-run] [--no-sms]
 */

require('../lib/load-env');
const { runQuoteFollowUps } = require('../services/quote-followup');
const { pool } = require('../lib/db');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const sendSms = !process.argv.includes('--no-sms');
  const result = await runQuoteFollowUps({
    dryRun,
    sendSms,
    log: (msg) => console.log('[quote-followup]', msg),
  });
  console.log('Processed:', result.processed, 'dryRun:', dryRun, 'sendSms:', sendSms);
  if (result.results && result.results.length) result.results.forEach((r) => console.log(JSON.stringify(r)));
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
