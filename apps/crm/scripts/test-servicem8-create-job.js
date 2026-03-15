#!/usr/bin/env node
/**
 * Phase 2A test: CRM -> ServiceM8 job creation.
 * Usage:
 *   node scripts/test-servicem8-create-job.js --opportunity-id <uuid> [--dry-run]
 *   node scripts/test-servicem8-create-job.js --list-opportunities   # list first 5 with account, no job yet
 */

require('../lib/load-env');
const { pool } = require('../lib/db');
const {
  createServiceM8JobFromCRM,
  loadOpportunityContext,
  ERROR_CODES,
} = require('../services/servicem8-create-job');

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const listOnly = args.includes('--list-opportunities');
  const idx = args.indexOf('--opportunity-id');
  const opportunityId = idx >= 0 && args[idx + 1] ? args[idx + 1] : null;

  if (listOnly) {
    const r = await pool.query(
      `SELECT o.id, o.account_id, o.contact_id, o.stage, o.service_m8_job_id, a.name AS account_name
       FROM opportunities o
       LEFT JOIN accounts a ON a.id = o.account_id
       WHERE o.service_m8_job_id IS NULL
       ORDER BY o.created_at DESC
       LIMIT 5`
    );
    console.log('Opportunities without ServiceM8 job (sample 5):');
    r.rows.forEach((row) => console.log(' ', row.id, row.account_name, row.stage));
    await pool.end();
    return;
  }

  if (!opportunityId) {
    console.log('Usage: node scripts/test-servicem8-create-job.js --opportunity-id <uuid> [--dry-run]');
    console.log('       node scripts/test-servicem8-create-job.js --list-opportunities');
    process.exit(1);
  }

  const ctx = await loadOpportunityContext(pool, opportunityId);
  if (!ctx) {
    console.error('Opportunity not found:', opportunityId);
    process.exit(1);
  }
  console.log('Opportunity context:', {
    account: ctx.account ? ctx.account.name : null,
    contact: ctx.contact ? ctx.contact.name : null,
    service_m8_job_id: ctx.opportunity.service_m8_job_id,
  });

  const result = await createServiceM8JobFromCRM(
    { opportunity_id: opportunityId, create_reason: 'test-script' },
    { dryRun, log: console.log }
  );

  console.log('Result:', result);
  if (!result.ok) console.log('Error code:', result.error_code);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
