#!/usr/bin/env node
/**
 * 验证 invoice sync：全量 sync 后检查 invoices 表是否有数据（含 job-derived）。
 * Usage:
 *   node scripts/test-invoice-sync.js           # 先 dry-run 再提示可执行全量 sync
 *   node scripts/test-invoice-sync.js --run     # 执行全量 sync 并查询 invoices
 */

require('../lib/load-env');
const { pool } = require('../lib/db');
const { syncAllFromServiceM8 } = require('../services/servicem8-sync');

const doRun = process.argv.includes('--run');

async function main() {
  if (!doRun) {
    const stats = await syncAllFromServiceM8({ dryRun: true, log: console.log });
    console.log('\n--- Dry-run stats (invoice-related) ---');
    console.log('invoices_fetched (invoice.json):', stats.invoices_fetched ?? 0);
    console.log('invoices_from_job_created:', stats.invoices_from_job_created ?? 0);
    console.log('invoices_from_job_updated:', stats.invoices_from_job_updated ?? 0);
    console.log('\nRun with --run to execute full sync and query invoices.');
    return;
  }

  console.log('Running full sync...');
  const stats = await syncAllFromServiceM8({ log: console.log });
  console.log('\n--- Sync stats (invoice-related) ---');
  console.log('invoices_fetched:', stats.invoices_fetched ?? 0);
  console.log('invoices_created:', stats.invoices_created ?? 0);
  console.log('invoices_updated:', stats.invoices_updated ?? 0);
  console.log('invoices_from_job_created:', stats.invoices_from_job_created ?? 0);
  console.log('invoices_from_job_updated:', stats.invoices_from_job_updated ?? 0);

  const countRes = await pool.query('SELECT COUNT(*) AS n FROM invoices');
  const sampleRes = await pool.query(
    `SELECT id, servicem8_invoice_uuid, servicem8_job_uuid, job_id, account_id, invoice_number, amount, invoice_date, due_date, status
     FROM invoices ORDER BY updated_at DESC NULLS LAST LIMIT 5`
  );
  console.log('\n--- Invoices table ---');
  console.log('Total rows:', countRes.rows[0]?.n ?? 0);
  console.log('Sample (latest 5):', JSON.stringify(sampleRes.rows, null, 2));
  pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
