/**
 * Report accounts with missing suburb information.
 *
 * Read-only: does not modify the database.
 *
 * Usage (from repo root):
 *   pnpm --filter @bht/crm run report:missing-suburb
 * or via root script if added.
 */

require('../lib/load-env');
const { pool } = require('../lib/db');

async function main() {
  const client = await pool.connect();
  try {
    console.log('Running missing-suburb report (read-only)...\n');

    const totals = await client.query(
      `SELECT
         COUNT(*) AS total_accounts,
         COUNT(*) FILTER (WHERE suburb IS NOT NULL AND TRIM(suburb) <> '') AS suburb_known,
         COUNT(*) FILTER (WHERE suburb IS NULL OR TRIM(suburb) = '') AS suburb_missing,
         COUNT(*) FILTER (WHERE (suburb IS NULL OR TRIM(suburb) = '') AND address_line IS NOT NULL AND TRIM(address_line) <> '') AS has_address_missing_suburb
       FROM accounts`
    );
    console.table(totals.rows);

    console.log('\nSample accounts with address_line but missing suburb (up to 50):');
    const sample = await client.query(
      `SELECT id, name, address_line, suburb, postcode
       FROM accounts
       WHERE (suburb IS NULL OR TRIM(suburb) = '')
         AND address_line IS NOT NULL
         AND TRIM(address_line) <> ''
       ORDER BY created_at DESC
       LIMIT 50`
    );
    console.table(sample.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('report-missing-suburb failed:', err);
    process.exit(1);
  });
}

