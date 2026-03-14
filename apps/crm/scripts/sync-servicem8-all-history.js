/**
 * ServiceM8 full history sync: companies → accounts, contacts, jobs, invoices, job_materials.
 * Idempotent, one-way. Use DRY_RUN=true to preview without writing.
 *
 * Run: pnpm sync:servicem8:all
 *      DRY_RUN=true pnpm sync:servicem8:all
 */

require('../lib/load-env');
const { syncAllHistoryFromServiceM8 } = require('../services/servicem8-sync');

const dryRun = process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';

function log(msg) {
  console.log(msg);
}

function onError(err, context) {
  console.error('Sync error', context || '', err && err.message);
}

async function main() {
  if (dryRun) console.log('--- DRY RUN (no DB writes) ---\n');

  const stats = await syncAllHistoryFromServiceM8({
    dryRun,
    log,
    onError,
  });

  if (stats.skipped && stats.locked) {
    console.log('\nSync skipped (another sync is running).');
    return;
  }

  console.log('\n--- Summary ---');
  console.log('Fetched:');
  console.log('  companies:', stats.companies_fetched);
  console.log('  contacts:', stats.contacts_fetched);
  console.log('  jobs:', stats.jobs_fetched);
  console.log('  invoices:', stats.invoices_fetched);
  console.log('  job materials:', stats.job_materials_fetched);
  console.log('Created:');
  console.log('  accounts:', stats.accounts_created);
  console.log('  contacts:', stats.contacts_created);
  console.log('  jobs:', stats.jobs_created);
  console.log('  invoices:', stats.invoices_created);
  console.log('  job materials:', stats.job_materials_created);
  console.log('Updated:');
  console.log('  accounts:', stats.accounts_updated);
  console.log('  contacts:', stats.contacts_updated);
  console.log('  jobs:', stats.jobs_updated);
  console.log('  invoices:', stats.invoices_updated);
  console.log('  job materials:', stats.job_materials_updated);
  console.log('Skipped:', stats.skipped);
  console.log('Errors:', stats.errors);
  if (dryRun) console.log('\n(DRY RUN: no changes written)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
