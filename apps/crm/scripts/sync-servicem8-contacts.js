/**
 * CLI: Run ServiceM8 → CRM contacts sync once.
 * Usage:
 *   node scripts/sync-servicem8-contacts.js
 *   DRY_RUN=true node scripts/sync-servicem8-contacts.js
 * From repo root: pnpm sync:servicem8:contacts
 */

require('../lib/load-env');

if (!process.env.SERVICEM8_API_KEY) {
  console.error('SERVICEM8_API_KEY is required. Add it to the repo root .env file (or export it).');
  process.exit(1);
}

const { syncContactsFromServiceM8 } = require('../services/servicem8-sync');
const { pool } = require('../lib/db');

const DRY_RUN = process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';

async function main() {
  if (DRY_RUN) {
    console.log('[DRY_RUN] No database writes will be performed.\n');
  }

  console.log('Fetching companies and contacts from ServiceM8...');
  const stats = await syncContactsFromServiceM8({
    dryRun: DRY_RUN,
    log: (msg) => console.log(msg),
    onError(err, fields) {
      console.error(`  Error ${fields?.servicem8_id || 'unknown'}:`, err.message);
    },
  });

  console.log('\n--- Sync complete ---');
  console.log(`Companies fetched:      ${stats.companies_fetched}`);
  console.log(`Contacts fetched:       ${stats.contacts_fetched}`);
  console.log(`New accounts:           ${stats.accounts_created}`);
  console.log(`Updated accounts:      ${stats.accounts_updated}`);
  console.log(`New contacts:          ${stats.contacts_created}`);
  console.log(`Updated contacts:      ${stats.contacts_updated}`);
  console.log(`Contacts skipped (no account): ${stats.contacts_skipped_no_account}`);
  console.log(`Skipped:                ${stats.skipped}`);
  console.log(`Errors:                 ${stats.errors}`);
  if (DRY_RUN) {
    console.log('\n[DRY_RUN] No changes were written to the database.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Sync failed:', err);
    process.exit(1);
  })
  .finally(() => {
    pool.end().catch(() => {});
  });
