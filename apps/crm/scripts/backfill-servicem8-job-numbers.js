#!/usr/bin/env node
/**
 * Backfill jobs.job_number + invoices.invoice_number from ServiceM8 generated_job_id.
 * Faster than full sync when only reference numbers / addresses are missing.
 *
 * Usage: node scripts/backfill-servicem8-job-numbers.js
 *        DRY_RUN=true node scripts/backfill-servicem8-job-numbers.js
 */

require('../lib/load-env');
const { ServiceM8Client } = require('@bht/integrations');
const { pool } = require('../lib/db');
const {
  extractJobNumber,
  extractJobAddress,
  backfillInvoiceNumbersFromJobs,
} = require('../services/servicem8-sync');

const dryRun = process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';

async function main() {
  const client = new ServiceM8Client();
  const raw = await client.getJobs('');
  const jobs = Array.isArray(raw) ? raw : raw && raw.data ? raw.data : [];
  console.log(`[backfill] fetched ${jobs.length} jobs from ServiceM8 (dry_run=${dryRun})`);

  const db = await pool.connect();
  let jobsUpdated = 0;
  let jobsSkipped = 0;

  try {
    for (const j of jobs) {
      const uuid = j.uuid || j.UUID;
      if (!uuid) {
        jobsSkipped++;
        continue;
      }
      const jobNumber = extractJobNumber(j);
      const address = extractJobAddress(j);
      if (!jobNumber && !address) {
        jobsSkipped++;
        continue;
      }
      if (dryRun) {
        jobsUpdated++;
        continue;
      }
      const r = await db.query(
        `UPDATE jobs SET
           job_number = COALESCE(NULLIF(TRIM($1), ''), job_number),
           address_line = COALESCE(NULLIF(TRIM($2), ''), address_line),
           updated_at = NOW(),
           last_synced_at = NOW()
         WHERE servicem8_job_uuid = $3`,
        [jobNumber, address, uuid]
      );
      if (r.rowCount > 0) jobsUpdated++;
      else jobsSkipped++;
    }

    const backfill = dryRun ? { invoices_backfilled: 0 } : await backfillInvoiceNumbersFromJobs(db, false);

    console.log('\n=== Result ===');
    console.log('jobs_updated:          ', jobsUpdated);
    console.log('jobs_skipped:          ', jobsSkipped);
    console.log('invoices_backfilled:   ', backfill.invoices_backfilled || 0);

    if (!dryRun) {
      const sample = await db.query(
        `SELECT i.invoice_number, j.job_number, j.address_line
         FROM invoices i
         JOIN jobs j ON j.id = i.job_id
         WHERE i.status = 'outstanding'
         ORDER BY i.amount DESC NULLS LAST
         LIMIT 5`
      );
      console.log('\nSample outstanding:');
      for (const row of sample.rows) {
        console.log(`  #${row.job_number || '—'} · ${row.invoice_number || '—'} · ${(row.address_line || '—').slice(0, 50)}`);
      }
    }
  } finally {
    db.release();
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('[backfill] fatal:', err.message || err);
    pool.end();
    process.exit(1);
  });
