/**
 * LEGACY SCRIPT — DO NOT USE FOR CONTACT SYNC
 * ------------------------------------------------------------
 * This one-off import script predates the formal ServiceM8 sync
 * service in `apps/crm/services/servicem8-sync.js`.
 *
 * It creates contacts from ServiceM8 company records
 * (company.name / company.company_name), which has been confirmed
 * to produce non-human / noisy contacts such as:
 *   - "Help Guide Job"
 *   - "Card xx1246"
 *   - "Transfer to ..."
 *   - "PAYPAL ..."
 *
 * The script is kept only for historical reference and should
 * NOT be run in production. For any customer/contacts sync or
 * recurring import, use the new ServiceM8 sync service instead:
 *   - apps/crm/services/servicem8-sync.js
 *   - apps/crm/scripts/sync-servicem8-all-history.js
 *   - apps/crm/scripts/sync-servicem8-contacts.js
 *
 * ServiceM8 → CRM Customer Import (LEGACY)
 * Fetches companies from ServiceM8, creates/updates accounts and contacts,
 * stores mapping in external_links. Supports DRY_RUN mode.
 */

require('../lib/load-env');
const { ServiceM8Client } = require('@bht/integrations');
const { pool } = require('../lib/db');

const DRY_RUN = process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';
const SYSTEM = 'servicem8';
const EXTERNAL_ENTITY_TYPE = 'company';

function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return null;
  return phone.replace(/\s+/g, '').replace(/[-()]/g, '').replace(/\D/g, '') || null;
}

function buildAddress(c) {
  const parts = [
    c.address_1 || c.address_street || c.street || '',
    c.address_2 || '',
    c.address_suburb || c.suburb || c.addressSuburb || '',
    c.address_post_code || c.postcode || c.addressPostCode || c.post_code || '',
  ].filter(Boolean);
  return parts.join(', ').trim() || null;
}

function extractCompanyFields(c) {
  const uuid = c.uuid || c.UUID;
  if (!uuid) return null;

  return {
    servicem8_id: uuid,
    account_name: c.name || c.company_name || c.companyName || '',
    address: buildAddress(c),
    suburb: c.address_suburb || c.suburb || c.addressSuburb || '',
    postcode: c.address_post_code || c.postcode || c.addressPostCode || c.post_code || '',
    contact_name: c.contact_name || c.name || c.company_name || c.companyName || '',
    phone: c.phone || c.phone_number || c.phoneNumber || c.mobile || '',
    email: c.email || '',
  };
}

async function findAccountByExternalId(db, servicem8Id) {
  const r = await db.query(
    `SELECT entity_id FROM external_links
     WHERE system = $1 AND external_entity_type = $2 AND external_id = $3`,
    [SYSTEM, EXTERNAL_ENTITY_TYPE, servicem8Id]
  );
  return r.rows[0]?.entity_id || null;
}

async function findAccountByNameAndAddress(db, name, address) {
  if (!name && !address) return null;
  const normName = (name || '').trim().toLowerCase();
  const normAddr = (address || '').trim().toLowerCase();
  const r = await db.query(
    `SELECT id FROM accounts
     WHERE LOWER(TRIM(name)) = $1 AND LOWER(TRIM(COALESCE(address_line, ''))) = $2
     LIMIT 1`,
    [normName, normAddr]
  );
  return r.rows[0]?.id || null;
}

async function findContactByPhone(db, phone) {
  if (!phone || typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  const r = await db.query(
    `SELECT id FROM contacts
     WHERE regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = $1
     LIMIT 1`,
    [digits]
  );
  return r.rows[0]?.id || null;
}

async function upsertExternalLink(db, servicem8Id, accountId) {
  if (DRY_RUN) return;
  await db.query(
    `INSERT INTO external_links (system, external_entity_type, external_id, entity_type, entity_id)
     VALUES ($1, $2, $3, 'account', $4)
     ON CONFLICT (system, external_entity_type, external_id)
     DO UPDATE SET entity_id = EXCLUDED.entity_id, updated_at = NOW()`,
    [SYSTEM, EXTERNAL_ENTITY_TYPE, servicem8Id, accountId]
  );
}

async function importCompanies() {
  const client = new ServiceM8Client();
  const db = await pool.connect();

  const stats = {
    total: 0,
    accounts_created: 0,
    accounts_updated: 0,
    contacts_created: 0,
    contacts_updated: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    if (DRY_RUN) console.log('[DRY_RUN] No database writes will be performed.\n');

    console.log('Fetching companies from ServiceM8...');
    const raw = await client.getCompanies();
    const companies = Array.isArray(raw)
      ? raw
      : (raw && raw.data) ? raw.data : [raw].filter(Boolean);
    console.log(`Fetched ${companies.length} companies.\n`);

    for (const c of companies) {
      const fields = extractCompanyFields(c);
      if (!fields) {
        stats.skipped++;
        continue;
      }
      stats.total++;

      try {
        let accountId = await findAccountByExternalId(db, fields.servicem8_id);
        let accountCreated = false;

        if (accountId) {
          if (!DRY_RUN) {
            await db.query(
              `UPDATE accounts SET name = $1, address_line = $2, suburb = $3, postcode = $4, updated_at = NOW()
               WHERE id = $5`,
              [fields.account_name || null, fields.address || null, fields.suburb || null, fields.postcode || null, accountId]
            );
          }
          stats.accounts_updated++;
        } else {
          accountId = await findAccountByNameAndAddress(db, fields.account_name, fields.address);
          if (accountId) {
            if (!DRY_RUN) {
              await db.query(
                `UPDATE accounts SET name = $1, address_line = $2, suburb = $3, postcode = $4, updated_at = NOW()
                 WHERE id = $5`,
                [fields.account_name || null, fields.address || null, fields.suburb || null, fields.postcode || null, accountId]
              );
              await upsertExternalLink(db, fields.servicem8_id, accountId);
            }
            stats.accounts_updated++;
          } else {
            if (DRY_RUN) {
              accountId = 'dry-run-account-id';
            } else {
              const ins = await db.query(
                `INSERT INTO accounts (name, address_line, suburb, postcode)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [fields.account_name || null, fields.address || null, fields.suburb || null, fields.postcode || null]
              );
              accountId = ins.rows[0].id;
              await upsertExternalLink(db, fields.servicem8_id, accountId);
            }
            accountCreated = true;
            stats.accounts_created++;
          }
        }

        let contactId = await findContactByPhone(db, fields.phone);
        let contactCreated = false;

        if (contactId) {
          if (!DRY_RUN) {
            await db.query(
              `UPDATE contacts SET name = $1, email = $2, phone = $3, account_id = $4, updated_at = NOW()
               WHERE id = $5`,
              [fields.contact_name || null, fields.email || null, fields.phone || null, accountId, contactId]
            );
          }
          stats.contacts_updated++;
        } else {
          if (DRY_RUN) {
            contactId = 'dry-run-contact-id';
          } else {
            const ins = await db.query(
              `INSERT INTO contacts (account_id, name, email, phone)
               VALUES ($1, $2, $3, $4) RETURNING id`,
              [accountId, fields.contact_name || null, fields.email || null, fields.phone || null]
            );
            contactId = ins.rows[0].id;
          }
          contactCreated = true;
          stats.contacts_created++;
        }
      } catch (err) {
        stats.errors++;
        console.error(`Error importing ${fields?.servicem8_id || 'unknown'}:`, err.message);
      }
    }

    console.log('\n--- Import complete ---');
    console.log(`Total processed:     ${stats.total}`);
    console.log(`New accounts:        ${stats.accounts_created}`);
    console.log(`Updated accounts:    ${stats.accounts_updated}`);
    console.log(`New contacts:        ${stats.contacts_created}`);
    console.log(`Updated contacts:    ${stats.contacts_updated}`);
    console.log(`Skipped:             ${stats.skipped}`);
    console.log(`Errors:              ${stats.errors}`);
    if (DRY_RUN) console.log('\n[DRY_RUN] No changes were written to the database.');
  } finally {
    db.release();
    await pool.end();
  }
}

importCompanies().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
