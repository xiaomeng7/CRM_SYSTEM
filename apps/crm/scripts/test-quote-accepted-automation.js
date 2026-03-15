#!/usr/bin/env node
/**
 * Test Quote Acceptance Automation.
 *
 * 1) Run automation for one opportunity (dry run or apply):
 *    node scripts/test-quote-accepted-automation.js [--apply] --opportunity-id <uuid>
 *
 * 2) Full webhook simulation (quote_accepted → stage Won + task + SMS + probability + audit):
 *    node scripts/test-quote-sync.js --webhook job_uuid=<job_uuid> status=accepted [--apply]
 *
 * 3) Assertions after run (manual or CI): stage=Won, task with task_type=job_preparation,
 *    opportunity.probability=100, automation_audit_log event_type=quote_accepted_automation.
 */

require('../lib/load-env');
const { pool } = require('../lib/db');
const { runQuoteAcceptedAutomation } = require('../services/quoteAcceptedAutomation');

async function run() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const dryRun = !apply;
  const idx = args.indexOf('--opportunity-id');
  const opportunityId = idx >= 0 && args[idx + 1] ? args[idx + 1] : null;

  if (!opportunityId) {
    console.log(`
Usage:
  node scripts/test-quote-accepted-automation.js [--apply] --opportunity-id <opportunity_uuid>

  --apply     run for real (task, SMS, probability, audit). Default is dry run.

Full E2E (webhook → stage + automation):
  node scripts/test-quote-sync.js --webhook job_uuid=<job_uuid> status=accepted [--apply]
`);
    process.exit(1);
  }

  const db = await pool.connect();
  try {
    const result = await runQuoteAcceptedAutomation(opportunityId, { db, dryRun, sendSms: true });
    console.log('Result:', result);
    if (dryRun) console.log('(Dry run: use --apply to persist task, SMS, probability, audit.)');
  } finally {
    db.release();
    await pool.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
