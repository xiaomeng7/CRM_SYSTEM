/**
 * Cleanup legacy noise data: obvious garbage contacts, accounts, and orphan external_links.
 *
 * IMPORTANT:
 * - Default mode is DRY_RUN (no deletes).
 * - Only when CONFIRM_DELETE=true will DELETE be executed.
 *
 * Usage (from repo root):
 *   DRY_RUN=true pnpm cleanup:legacy-noise
 *   CONFIRM_DELETE=true pnpm cleanup:legacy-noise
 */

require('../lib/load-env');
const { pool } = require('../lib/db');

const DRY_RUN = process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';
const CONFIRM_DELETE = process.env.CONFIRM_DELETE === 'true' || process.env.CONFIRM_DELETE === '1';

const SUSPICIOUS_PATTERNS = [
  '%Job%',
  '%Card%',
  '%PAYPAL%',
  '%Transfer%',
  '%Help%',
  '%Test%',
  '%Payment%',
];

async function main() {
  const client = await pool.connect();
  const summary = {
    contacts_delete_candidates: 0,
    accounts_delete_candidates: 0,
    external_links_delete_candidates: 0,
    contacts_deleted: 0,
    accounts_deleted: 0,
    external_links_deleted: 0,
  };

  try {
    console.log('Legacy noise cleanup script starting...');
    console.log('DRY_RUN =', DRY_RUN);
    console.log('CONFIRM_DELETE =', CONFIRM_DELETE);
    console.log('');

    // 1. Find legacy/noise contacts (candidates)
    const contactsCandidates = await client.query(
      `SELECT c.id,
              c.name,
              c.phone,
              c.email,
              c.created_by
       FROM contacts c
       LEFT JOIN accounts a ON c.account_id = a.id
       WHERE (c.phone IS NULL OR TRIM(c.phone) = '')
         AND (c.email IS NULL OR TRIM(c.email) = '')
         AND c.name ILIKE ANY($1::text[])
         AND (c.created_by IS NULL OR c.created_by NOT IN ('landing-page','crm-ui'))`,
      [SUSPICIOUS_PATTERNS]
    );
    summary.contacts_delete_candidates = contactsCandidates.rowCount;

    console.log('--- Contacts delete candidates ---');
    console.log('Total candidates:', summary.contacts_delete_candidates);
    contactsCandidates.rows.slice(0, 20).forEach((row, idx) => {
      console.log(
        `${idx + 1}. contact_id=${row.id}, name="${row.name}", phone="${row.phone || ''}", email="${row.email || ''}", created_by=${row.created_by || 'NULL'}`
      );
    });
    console.log('');

    // 2. Find legacy/noise accounts (candidates) – after contacts deletion this will be more accurate
    const accountsCandidates = await client.query(
      `SELECT a.id,
              a.name,
              a.suburb,
              a.address_line,
              a.created_by
       FROM accounts a
       LEFT JOIN contacts c ON c.account_id = a.id
       LEFT JOIN jobs j ON j.account_id = a.id
       WHERE c.id IS NULL
         AND j.id IS NULL
         AND a.name ILIKE ANY($1::text[])
         AND (a.created_by IS NULL OR a.created_by NOT IN ('landing-page','crm-ui'))`,
      [SUSPICIOUS_PATTERNS]
    );
    summary.accounts_delete_candidates = accountsCandidates.rowCount;

    console.log('--- Accounts delete candidates ---');
    console.log('Total candidates:', summary.accounts_delete_candidates);
    accountsCandidates.rows.slice(0, 20).forEach((row, idx) => {
      console.log(
        `${idx + 1}. account_id=${row.id}, name="${row.name}", suburb="${row.suburb || ''}", address="${row.address_line || ''}", created_by=${row.created_by || 'NULL'}`
      );
    });
    console.log('');

    // 3. Find orphan external_links (system=servicem8, for accounts/contacts)
    const orphanLinks = await client.query(
      `SELECT el.id,
              el.system,
              el.external_entity_type,
              el.external_id,
              el.entity_type,
              el.entity_id
       FROM external_links el
       LEFT JOIN accounts a ON (el.entity_type = 'account' AND el.entity_id = a.id)
       LEFT JOIN contacts c ON (el.entity_type = 'contact' AND el.entity_id = c.id)
       WHERE el.system = 'servicem8'
         AND ((el.entity_type = 'account' AND a.id IS NULL)
           OR (el.entity_type = 'contact' AND c.id IS NULL))`
    );
    summary.external_links_delete_candidates = orphanLinks.rowCount;

    console.log('--- Orphan external_links candidates ---');
    console.log('Total candidates:', summary.external_links_delete_candidates);
    orphanLinks.rows.slice(0, 20).forEach((row, idx) => {
      console.log(
        `${idx + 1}. link_id=${row.id}, system=${row.system}, type=${row.external_entity_type}/${row.entity_type}, external_id=${row.external_id}, entity_id=${row.entity_id}`
      );
    });
    console.log('');

    if (!CONFIRM_DELETE) {
      console.log('CONFIRM_DELETE is not true. Running in DRY_RUN / preview-only mode, no rows will be deleted.');
      console.log('');
      console.log('Summary (preview):');
      console.log('  contacts_delete_candidates      =', summary.contacts_delete_candidates);
      console.log('  accounts_delete_candidates      =', summary.accounts_delete_candidates);
      console.log('  external_links_delete_candidates =', summary.external_links_delete_candidates);
      return;
    }

    console.log('CONFIRM_DELETE=true detected. Proceeding with deletions (separate statements)...');

    // Delete contacts
    if (summary.contacts_delete_candidates > 0) {
      const contactIds = contactsCandidates.rows.map((r) => r.id);
      const res = await client.query(
        `DELETE FROM contacts WHERE id = ANY($1::uuid[])`,
        [contactIds]
      );
      summary.contacts_deleted = res.rowCount || 0;
    }

    // Delete accounts
    if (summary.accounts_delete_candidates > 0) {
      const accountIds = accountsCandidates.rows.map((r) => r.id);
      const res = await client.query(
        `DELETE FROM accounts WHERE id = ANY($1::uuid[])`,
        [accountIds]
      );
      summary.accounts_deleted = res.rowCount || 0;
    }

    // Delete orphan external_links
    if (summary.external_links_delete_candidates > 0) {
      const linkIds = orphanLinks.rows.map((r) => r.id);
      const res = await client.query(
        `DELETE FROM external_links WHERE id = ANY($1::uuid[])`,
        [linkIds]
      );
      summary.external_links_deleted = res.rowCount || 0;
    }

    console.log('');
    console.log('Summary (executed):');
    console.log('  contacts_delete_candidates       =', summary.contacts_delete_candidates);
    console.log('  accounts_delete_candidates       =', summary.accounts_delete_candidates);
    console.log('  external_links_delete_candidates =', summary.external_links_delete_candidates);
    console.log('  contacts_deleted                 =', summary.contacts_deleted);
    console.log('  accounts_deleted                 =', summary.accounts_deleted);
    console.log('  external_links_deleted           =', summary.external_links_deleted);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('cleanup-legacy-noise failed:', err);
  process.exit(1);
});

