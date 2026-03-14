/**
 * Normalize CRM data for phone/email/suburb/address quality.
 *
 * This script:
 * 1) Normalizes contacts.phone (digits only, handle 61 -> 0, length check)
 * 2) Normalizes contacts.email (trim + lowercase, invalid emails -> NULL)
 * 3) Normalizes accounts.suburb (InitCap)
 * 4) Attempts to backfill missing suburb from jobs.suburb
 * 5) Prints data quality stats at the end
 *
 * IMPORTANT:
 * - This script updates data in-place but does NOT delete any rows.
 * - No business logic or UI is changed; only field normalization and minor backfill.
 *
 * Usage (from repo root):
 *   pnpm normalize:crm-data
 */

require('../lib/load-env');
const { pool } = require('../lib/db');
const { extractSuburbFromAddress } = require('../lib/crm/cleaning');

async function runUpdates(client) {
  console.log('Normalizing contacts.phone (strip non-digits)...');
  await client.query(
    `UPDATE contacts
     SET phone = regexp_replace(phone, '[^0-9]', '', 'g')
     WHERE phone IS NOT NULL AND phone <> ''`
  );

  console.log('Handling AU +61 prefix (61xxxx -> 0xxxx)...');
  await client.query(
    `UPDATE contacts
     SET phone = '0' || substring(phone from 3)
     WHERE phone LIKE '61%' AND length(phone) >= 3`
  );

  console.log('Nulling invalid phone lengths (not between 9 and 10 digits)...');
  await client.query(
    `UPDATE contacts
     SET phone = NULL
     WHERE phone IS NOT NULL
       AND length(phone) NOT BETWEEN 9 AND 10`
  );

  console.log('Normalizing contacts.email (trim + lowercase)...');
  await client.query(
    `UPDATE contacts
     SET email = LOWER(TRIM(email))
     WHERE email IS NOT NULL`
  );

  console.log('Nulling invalid emails (no @)...');
  await client.query(
    `UPDATE contacts
     SET email = NULL
     WHERE email IS NOT NULL
       AND email NOT LIKE '%@%'`
  );

  console.log('Normalizing accounts.suburb (InitCap)...');
  await client.query(
    `UPDATE accounts
     SET suburb = INITCAP(LOWER(suburb))
     WHERE suburb IS NOT NULL AND TRIM(suburb) <> ''`
  );

  console.log('Backfilling missing suburbs from jobs.suburb...');
  await client.query(
    `UPDATE accounts a
     SET suburb = j.suburb
     FROM jobs j
     WHERE a.suburb IS NULL
       AND j.account_id = a.id
       AND j.suburb IS NOT NULL`
  );

  console.log('Backfilling missing suburbs from accounts.address_line via extractor...');
  const res = await client.query(
    `SELECT id, address_line
     FROM accounts
     WHERE (suburb IS NULL OR TRIM(suburb) = '')
       AND address_line IS NOT NULL
       AND TRIM(address_line) <> ''`
  );
  let filled = 0;
  for (const row of res.rows) {
    const suburb = extractSuburbFromAddress(row.address_line);
    if (!suburb) continue;
    await client.query(
      `UPDATE accounts SET suburb = $1 WHERE id = $2 AND (suburb IS NULL OR TRIM(suburb) = '')`,
      [suburb, row.id]
    );
    filled++;
  }
  console.log('Suburbs backfilled from address_line:', filled);
}

async function printStats(client) {
  console.log('\n=== Data quality report ===\n');

  console.log('Contact reachability (phone/email completeness)...');
  const contactsReach = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE phone IS NOT NULL) AS has_phone,
       COUNT(*) FILTER (WHERE email IS NOT NULL) AS has_email,
       COUNT(*) FILTER (WHERE phone IS NULL AND email IS NULL) AS unreachable
     FROM contacts`
  );
  console.table(contactsReach.rows);

  console.log('\nAccounts suburb completeness...');
  const suburbStats = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE suburb IS NOT NULL AND TRIM(suburb) <> '') AS suburb_known,
       COUNT(*) FILTER (WHERE suburb IS NULL OR TRIM(suburb) = '') AS suburb_missing
     FROM accounts`
  );
  console.table(suburbStats.rows);

  console.log('\nTop 20 duplicate phones (after normalization)...');
  const dupPhones = await client.query(
    `SELECT phone, COUNT(*) AS cnt
     FROM contacts
     WHERE phone IS NOT NULL AND phone <> ''
     GROUP BY phone
     HAVING COUNT(*) > 1
     ORDER BY cnt DESC, phone
     LIMIT 20`
  );
  console.table(dupPhones.rows);

  console.log('\nTop 20 duplicate emails (after normalization)...');
  const dupEmails = await client.query(
    `SELECT email, COUNT(*) AS cnt
     FROM contacts
     WHERE email IS NOT NULL AND email <> ''
     GROUP BY email
     HAVING COUNT(*) > 1
     ORDER BY cnt DESC, email
     LIMIT 20`
  );
  console.table(dupEmails.rows);
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('Starting CRM data normalization...');
    await runUpdates(client);
    await printStats(client);
    console.log('\nCRM data normalization completed.');
  } catch (err) {
    console.error('normalize-crm-data failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

