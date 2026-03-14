/**
 * Report suspicious / likely-noise contacts (read-only).
 *
 * This script DOES NOT write to the database. It runs a few heuristics
 * to surface contacts that are likely created by the legacy
 * import-servicem8-customers.js script (company.name used as contact.name).
 *
 * Usage (from repo root):
 *   node apps/crm/scripts/report-suspicious-contacts.js
 *
 * Environment:
 *   - DATABASE_URL, DATABASE_SSL (via ../lib/load-env)
 */

require('../lib/load-env');
const { pool } = require('../lib/db');

async function main() {
  const client = await pool.connect();
  try {
    console.log('Running suspicious contacts report (read-only)...\n');

    // Rule 1: phone IS NULL AND email IS NULL
    const r1 = await client.query(
      `SELECT COUNT(*) AS count
       FROM contacts
       WHERE (phone IS NULL OR TRIM(phone) = '')
         AND (email IS NULL OR TRIM(email) = '')`
    );

    // Rule 2: name contains noisy patterns
    const patterns = ['%Job%', '%Card%', '%PAYPAL%', '%Transfer%', '%Help%'];
    const r2 = await client.query(
      `SELECT COUNT(*) AS count
       FROM contacts
       WHERE name ILIKE ANY($1::text[])`,
      [patterns]
    );

    // Rule 3: combination of (no phone/email) + noisy name
    const r3 = await client.query(
      `SELECT COUNT(*) AS count
       FROM contacts
       WHERE (phone IS NULL OR TRIM(phone) = '')
         AND (email IS NULL OR TRIM(email) = '')
         AND name ILIKE ANY($1::text[])`,
      [patterns]
    );

    // Rule 4: join accounts for weak account signals (no suburb & no address_line)
    const r4 = await client.query(
      `SELECT COUNT(*) AS count
       FROM contacts c
       LEFT JOIN accounts a ON c.account_id = a.id
       WHERE (c.phone IS NULL OR TRIM(c.phone) = '')
         AND (c.email IS NULL OR TRIM(c.email) = '')
         AND c.name ILIKE ANY($1::text[])
         AND (a.id IS NULL OR (COALESCE(TRIM(a.suburb), '') = '' AND COALESCE(TRIM(a.address_line), '') = ''))`,
      [patterns]
    );

    // Sample rows (top 50) for manual review
    const sample = await client.query(
      `SELECT c.id,
              c.name,
              c.phone,
              c.email,
              c.created_at,
              c.created_by,
              a.id AS account_id,
              a.name AS account_name,
              a.suburb AS account_suburb,
              a.address_line AS account_address
       FROM contacts c
       LEFT JOIN accounts a ON c.account_id = a.id
       WHERE (c.phone IS NULL OR TRIM(c.phone) = '')
         AND (c.email IS NULL OR TRIM(c.email) = '')
         AND c.name ILIKE ANY($1::text[])
       ORDER BY c.created_at DESC
       LIMIT 50`,
      [patterns]
    );

    console.log('--- Suspicious contacts summary ---');
    console.log('Rule 1: phone IS NULL AND email IS NULL              =>', r1.rows[0].count);
    console.log('Rule 2: name matches one of patterns (Job/Card/...)  =>', r2.rows[0].count);
    console.log('Rule 3: Rule1 + Rule2 (likely legacy noise)          =>', r3.rows[0].count);
    console.log('Rule 4: Rule3 + weak account (no suburb/address)     =>', r4.rows[0].count);
    console.log('\nPatterns used (ILIKE):', patterns.join(', '), '\n');

    console.log('--- Sample (top 50) suspicious contacts ---');
    sample.rows.forEach((row, idx) => {
      console.log(
        `${idx + 1}. contact_id=${row.id}, name="${row.name}", ` +
        `account="${row.account_name || ''}" (${row.account_suburb || ''}), ` +
        `created_at=${row.created_at?.toISOString?.() || row.created_at}, ` +
        `created_by=${row.created_by || 'NULL'}`
      );
    });

    console.log('\nNOTE: This script is read-only. Use the output to drive manual review or follow-up cleanup SQL.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Report failed:', err);
  process.exit(1);
});

