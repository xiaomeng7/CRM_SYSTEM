/**
 * Archive suspicious / likely-noise contacts (soft delete via status='archived').
 *
 * Rules mirror report-suspicious-contacts.js:
 *   - phone IS NULL OR '' AND email IS NULL OR ''
 *   - name ILIKE ANY(['%Job%', '%Card%', '%PAYPAL%', '%Transfer%', '%Help%'])
 *
 * This script NEVER deletes data. It only updates contacts.status to 'archived'
 * for matching rows, and only when DRY_RUN is not set.
 *
 * Usage (from repo root):
 *   # Dry run (no DB writes)
 *   DRY_RUN=true node apps/crm/scripts/archive-suspicious-contacts.js
 *
 *   # Execute (archive)
 *   node apps/crm/scripts/archive-suspicious-contacts.js
 */

require('../lib/load-env');
const { pool } = require('../lib/db');

const DRY_RUN = process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';

async function main() {
  const client = await pool.connect();
  try {
    console.log('Running archive-suspicious-contacts (soft archive)...');
    if (DRY_RUN) {
      console.log('[DRY_RUN] No database writes will be performed.\n');
    }

    const patterns = ['%Job%', '%Card%', '%PAYPAL%', '%Transfer%', '%Help%'];

    // Candidates: Rule1 + Rule2, and currently not already archived
    const candidates = await client.query(
      `SELECT c.id,
              c.name,
              c.phone,
              c.email,
              c.status,
              c.created_at,
              a.name AS account_name,
              a.suburb AS account_suburb
       FROM contacts c
       LEFT JOIN accounts a ON c.account_id = a.id
       WHERE (c.phone IS NULL OR TRIM(c.phone) = '')
         AND (c.email IS NULL OR TRIM(c.email) = '')
         AND c.name ILIKE ANY($1::text[])
         AND COALESCE(c.status, 'active') <> 'archived'`,
      [patterns]
    );

    const totalCandidates = candidates.rows.length;
    let archivedCount = 0;
    let skippedCount = 0;

    if (!DRY_RUN && totalCandidates > 0) {
      const ids = candidates.rows.map((r) => r.id);
      const res = await client.query(
        `UPDATE contacts
         SET status = 'archived', updated_at = NOW()
         WHERE id = ANY($1::uuid[])
           AND COALESCE(status, 'active') <> 'archived'`,
        [ids]
      );
      archivedCount = res.rowCount || 0;
    } else {
      skippedCount = totalCandidates;
    }

    console.log('--- Archive suspicious contacts summary ---');
    console.log('Total candidates (Rule1+Rule2, not archived):', totalCandidates);
    console.log('Archived (status -> archived):', archivedCount);
    console.log('Skipped (including DRY_RUN):', skippedCount);
    console.log('\nPatterns used (ILIKE):', patterns.join(', '), '\n');

    const sample = candidates.rows.slice(0, 50);
    console.log('--- Sample (up to 50) archived candidates ---');
    sample.forEach((row, idx) => {
      console.log(
        `${idx + 1}. contact_id=${row.id}, status=${row.status || 'NULL'}, ` +
        `name="${row.name}", phone="${row.phone || ''}", email="${row.email || ''}", ` +
        `account="${row.account_name || ''}" (${row.account_suburb || ''}), ` +
        `created_at=${row.created_at?.toISOString?.() || row.created_at}`
      );
    });

    console.log('\nNOTE: This script only sets status=\'archived\'. No rows are deleted.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Archive script failed:', err);
  process.exit(1);
});

