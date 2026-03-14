/**
 * Repair accounts.suburb when lost (e.g. overwritten by ServiceM8 sync with empty).
 * Backfills from: 1) jobs.suburb 2) address_line extractor
 * Safe: only updates rows where suburb is currently empty.
 *
 * Usage: pnpm --filter @bht/crm run repair:suburb
 */

require('../lib/load-env');
const { pool } = require('../lib/db');
const { extractSuburbFromAddress } = require('../lib/crm/cleaning');

async function main() {
  const client = await pool.connect();
  try {
    console.log('Repairing missing suburbs from jobs...');
    const r1 = await client.query(
      `UPDATE accounts a
       SET suburb = j.suburb
       FROM (
         SELECT DISTINCT ON (account_id) account_id, suburb
         FROM jobs
         WHERE suburb IS NOT NULL AND TRIM(suburb) <> ''
         ORDER BY account_id, completed_at DESC NULLS LAST, job_date DESC NULLS LAST
       ) j
       WHERE a.id = j.account_id
         AND (a.suburb IS NULL OR TRIM(a.suburb) = '')`
    );
    console.log('  Updated from jobs:', r1.rowCount);

    console.log('Repairing missing suburbs from address_line...');
    const res = await client.query(
      `SELECT id, address_line FROM accounts
       WHERE (suburb IS NULL OR TRIM(suburb) = '')
         AND address_line IS NOT NULL AND TRIM(address_line) <> ''`
    );
    let filled = 0;
    for (const row of res.rows) {
      const suburb = extractSuburbFromAddress(row.address_line);
      if (!suburb) continue;
      await client.query(
        `UPDATE accounts SET suburb = $1 WHERE id = $2`,
        [suburb, row.id]
      );
      filled++;
    }
    console.log('  Updated from address_line:', filled);

    const stats = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE suburb IS NOT NULL AND TRIM(suburb) <> '') AS suburb_known,
         COUNT(*) FILTER (WHERE suburb IS NULL OR TRIM(suburb) = '') AS suburb_missing
       FROM accounts`
    );
    console.log('\nAccounts suburb status:', stats.rows[0]);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
