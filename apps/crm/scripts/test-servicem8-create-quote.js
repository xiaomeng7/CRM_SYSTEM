#!/usr/bin/env node
/**
 * Phase 2B test: CRM -> ServiceM8 quote creation.
 * Usage:
 *   node scripts/test-servicem8-create-quote.js --opportunity-id <uuid> [--dry-run]
 *   node scripts/test-servicem8-create-quote.js --list-opportunities   # list with job, no active quote
 */

require('../lib/load-env');
const { pool } = require('../lib/db');
const {
  createServiceM8QuoteFromCRM,
  loadOpportunityForQuote,
  getActiveQuoteForOpportunity,
} = require('../services/servicem8-create-quote');

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const listOnly = args.includes('--list-opportunities');
  const idx = args.indexOf('--opportunity-id');
  const opportunityId = idx >= 0 && args[idx + 1] ? args[idx + 1] : null;

  if (listOnly) {
    const r = await pool.query(
      `SELECT o.id, o.service_m8_job_id, a.name AS account_name,
              (SELECT COUNT(*) FROM quotes q WHERE q.opportunity_id = o.id AND (q.status IS NULL OR LOWER(TRIM(COALESCE(q.status,''))) != 'declined')) AS active_quotes
       FROM opportunities o
       LEFT JOIN accounts a ON a.id = o.account_id
       WHERE o.service_m8_job_id IS NOT NULL
       ORDER BY o.updated_at DESC
       LIMIT 10`
    );
    console.log('Opportunities with ServiceM8 job (sample 10):');
    r.rows.forEach((row) => console.log(' ', row.id, row.account_name, 'active_quotes=', row.active_quotes));
    await pool.end();
    return;
  }

  if (!opportunityId) {
    console.log('Usage: node scripts/test-servicem8-create-quote.js --opportunity-id <uuid> [--dry-run]');
    console.log('       node scripts/test-servicem8-create-quote.js --list-opportunities');
    process.exit(1);
  }

  const ctx = await loadOpportunityForQuote(pool, opportunityId);
  if (!ctx) {
    console.error('Opportunity not found:', opportunityId);
    process.exit(1);
  }
  console.log('Context:', { service_m8_job_id: ctx.service_m8_job_id, job_id: ctx.job_id, account_name: ctx.account_name });
  const active = await getActiveQuoteForOpportunity(pool, opportunityId);
  if (active) console.log('Existing active quote:', active.id, active.servicem8_quote_uuid);

  const result = await createServiceM8QuoteFromCRM(
    { opportunity_id: opportunityId, description: 'Test quote from script', amount_estimate: 1500 },
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
