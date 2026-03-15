#!/usr/bin/env node
/**
 * Test Opportunity Auto Convert → Job.
 *
 * 1) List opportunities suitable for testing (no job, can set stage):
 *    node scripts/test-opportunity-auto-convert-job.js --list
 *
 * 2) Run automation for one opportunity (dry run or apply):
 *    node scripts/test-opportunity-auto-convert-job.js [--apply] --opportunity-id <uuid>
 *
 * 3) Test duplicate protection (run twice with same opportunity that already has job):
 *    node scripts/test-opportunity-auto-convert-job.js --apply --opportunity-id <uuid_with_job>
 *    → second run should return already_has_job, no new job created.
 *
 * 4) Stage linkage: PATCH /api/opportunities/:id/stage with body { stage: "site_visit_booked" }
 *    or { stage: "qualified" } triggers auto-create; response includes _job_auto.
 */

require('../lib/load-env');
const { pool } = require('../lib/db');
const { ensurePrimaryJobForOpportunity, STAGES_TRIGGER_JOB } = require('../services/opportunityAutoConvertToJob');

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const dryRun = !apply;
  const listOnly = args.includes('--list');
  const idx = args.indexOf('--opportunity-id');
  const opportunityId = idx >= 0 && args[idx + 1] ? args[idx + 1] : null;

  if (listOnly) {
    const r = await pool.query(
      `SELECT o.id, o.stage, o.service_m8_job_id, a.name AS account_name
       FROM opportunities o
       LEFT JOIN accounts a ON a.id = o.account_id
       WHERE o.service_m8_job_id IS NULL
         AND o.stage IN ($1, $2)
       ORDER BY o.updated_at DESC
       LIMIT 10`,
      [STAGES_TRIGGER_JOB[0], STAGES_TRIGGER_JOB[1]]
    );
    console.log('Opportunities with stage Inspection Booked or Qualified and no job (sample 10):');
    if (r.rows.length === 0) {
      const any = await pool.query(
        `SELECT o.id, o.stage, o.service_m8_job_id, a.name AS account_name
         FROM opportunities o LEFT JOIN accounts a ON a.id = o.account_id
         WHERE o.service_m8_job_id IS NULL ORDER BY o.updated_at DESC LIMIT 5`
      );
      console.log('  (none in trigger stages; any without job):', any.rows.map((x) => ({ id: x.id, stage: x.stage, account: x.account_name })));
    } else {
      r.rows.forEach((row) => console.log(' ', row.id, row.stage, row.account_name));
    }
    await pool.end();
    return;
  }

  if (!opportunityId) {
    console.log(`
Usage:
  node scripts/test-opportunity-auto-convert-job.js --list
  node scripts/test-opportunity-auto-convert-job.js [--apply] --opportunity-id <uuid>

  --apply     create job for real (default: dry run).
  --list      list opportunities with stage Inspection Booked/Qualified and no job.
`);
    process.exit(1);
  }

  const result = await ensurePrimaryJobForOpportunity(opportunityId, {
    dryRun,
    log: (msg, extra) => (extra ? console.log(msg, extra) : console.log(msg)),
  });

  console.log('Result:', result);
  if (dryRun && result.ran) console.log('(Dry run: use --apply to create job.)');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
