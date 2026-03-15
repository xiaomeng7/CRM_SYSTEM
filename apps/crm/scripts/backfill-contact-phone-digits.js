#!/usr/bin/env node
/**
 * Backfill contacts.phone_raw and contacts.phone_digits from contacts.phone.
 * Run after migration 018. Idempotent: only updates when phone_digits is null/empty.
 */

require('../lib/load-env');
const { pool } = require('../lib/db');
const { normalizePhoneDigits } = require('../lib/crm/cleaning');

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  const res = await pool.query(
    `SELECT id, phone FROM contacts
     WHERE phone IS NOT NULL AND TRIM(phone) <> ''
       AND (phone_digits IS NULL OR TRIM(COALESCE(phone_digits, '')) = '')`
  );

  let updated = 0;
  for (const row of res.rows) {
    const digits = normalizePhoneDigits(row.phone);
    if (!dryRun && digits) {
      await pool.query(
        `UPDATE contacts SET phone_raw = COALESCE(phone_raw, phone), phone_digits = $1, updated_at = NOW() WHERE id = $2`,
        [digits, row.id]
      );
      updated++;
    } else if (dryRun && digits) {
      updated++;
    }
  }

  console.log(dryRun ? `[dry-run] would update ${updated} contacts` : `Updated ${updated} contacts with phone_digits`);
  await pool.end();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
