/**
 * ServiceM8 → CRM sync service (accounts, contacts, external_links).
 * Idempotent, one-way sync. Safe to run repeatedly.
 * Used by CLI script and future cron/scheduled triggers.
 */

const { ServiceM8Client } = require('@bht/integrations');
const { pool } = require('../lib/db');

const SYSTEM = 'servicem8';
const EXTERNAL_ENTITY_TYPE = 'company';

function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return null;
  return phone.replace(/\D/g, '').trim() || null;
}

function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return null;
  return email.trim().toLowerCase() || null;
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
    account_name: (c.name || c.company_name || c.companyName || '').trim() || null,
    address: buildAddress(c),
    suburb: (c.address_suburb || c.suburb || c.addressSuburb || '').trim() || null,
    postcode: (c.address_post_code || c.postcode || c.addressPostCode || c.post_code || '').trim() || null,
    contact_name: (c.contact_name || c.name || c.company_name || c.companyName || '').trim() || null,
    phone: (c.phone || c.phone_number || c.phoneNumber || c.mobile || '').trim() || null,
    email: (c.email || '').trim() || null,
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

async function findAccountByNameAndSuburb(db, name, suburb) {
  const normName = (name || '').trim().toLowerCase();
  const normSuburb = (suburb || '').trim().toLowerCase();
  if (!normName) return null;
  const r = await db.query(
    `SELECT id FROM accounts
     WHERE LOWER(TRIM(name)) = $1 AND LOWER(TRIM(COALESCE(suburb, ''))) = $2
     LIMIT 1`,
    [normName, normSuburb]
  );
  return r.rows[0]?.id || null;
}

async function findAccountByNameAndAddress(db, name, address) {
  if (!(name || address)) return null;
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
  const digits = normalizePhone(phone);
  if (!digits) return null;
  const r = await db.query(
    `SELECT id FROM contacts
     WHERE regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = $1
     LIMIT 1`,
    [digits]
  );
  return r.rows[0]?.id || null;
}

async function findContactByEmail(db, email) {
  const norm = normalizeEmail(email);
  if (!norm) return null;
  const r = await db.query(
    `SELECT id FROM contacts WHERE LOWER(TRIM(email)) = $1 LIMIT 1`,
    [norm]
  );
  return r.rows[0]?.id || null;
}

async function findExistingContact(db, phone, email) {
  const byPhone = await findContactByPhone(db, phone);
  if (byPhone) return byPhone;
  const byEmail = await findContactByEmail(db, email);
  if (byEmail) return byEmail;
  return null;
}

async function upsertExternalLink(db, servicem8Id, accountId, dryRun) {
  if (dryRun) return;
  await db.query(
    `INSERT INTO external_links (system, external_entity_type, external_id, entity_type, entity_id)
     VALUES ($1, $2, $3, 'account', $4)
     ON CONFLICT (system, external_entity_type, external_id)
     DO UPDATE SET entity_id = EXCLUDED.entity_id, updated_at = NOW()`,
    [SYSTEM, EXTERNAL_ENTITY_TYPE, servicem8Id, accountId]
  );
}

/**
 * Run one full sync from ServiceM8 into CRM (accounts, contacts, external_links).
 * @param {Object} options
 * @param {boolean} [options.dryRun=false] - If true, no DB writes; stats still reflect what would happen.
 * @returns {Promise<{ total, accounts_created, accounts_updated, contacts_created, contacts_updated, skipped, errors }>}
 */
async function syncContactsFromServiceM8(options = {}) {
  const dryRun = Boolean(options.dryRun);
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
    const raw = await client.getCompanies();
    const companies = Array.isArray(raw)
      ? raw
      : (raw && raw.data) ? raw.data : [raw].filter(Boolean);

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
          if (!dryRun) {
            await db.query(
              `UPDATE accounts SET name = $1, address_line = $2, suburb = $3, postcode = $4, updated_at = NOW()
               WHERE id = $5`,
              [fields.account_name, fields.address, fields.suburb, fields.postcode, accountId]
            );
          }
          stats.accounts_updated++;
        } else {
          accountId =
            (await findAccountByNameAndSuburb(db, fields.account_name, fields.suburb)) ||
            (await findAccountByNameAndAddress(db, fields.account_name, fields.address));
          if (accountId) {
            if (!dryRun) {
              await db.query(
                `UPDATE accounts SET name = $1, address_line = $2, suburb = $3, postcode = $4, updated_at = NOW()
                 WHERE id = $5`,
                [fields.account_name, fields.address, fields.suburb, fields.postcode, accountId]
              );
              await upsertExternalLink(db, fields.servicem8_id, accountId, dryRun);
            }
            stats.accounts_updated++;
          } else {
            if (!dryRun) {
              const ins = await db.query(
                `INSERT INTO accounts (name, address_line, suburb, postcode)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [fields.account_name, fields.address, fields.suburb, fields.postcode]
              );
              accountId = ins.rows[0].id;
              await upsertExternalLink(db, fields.servicem8_id, accountId, dryRun);
            } else {
              accountId = 'dry-run-account-id';
            }
            accountCreated = true;
            stats.accounts_created++;
          }
        }

        let contactId = await findExistingContact(db, fields.phone, fields.email);
        let contactCreated = false;

        if (contactId) {
          if (!dryRun) {
            await db.query(
              `UPDATE contacts SET name = $1, email = $2, phone = $3, account_id = $4, updated_at = NOW()
               WHERE id = $5`,
              [fields.contact_name, fields.email || null, fields.phone || null, accountId, contactId]
            );
          }
          stats.contacts_updated++;
        } else {
          if (!dryRun) {
            const ins = await db.query(
              `INSERT INTO contacts (account_id, name, email, phone)
               VALUES ($1, $2, $3, $4) RETURNING id`,
              [accountId, fields.contact_name, fields.email || null, fields.phone || null]
            );
            contactId = ins.rows[0].id;
          }
          contactCreated = true;
          stats.contacts_created++;
        }
      } catch (err) {
        stats.errors++;
        if (options.onError) {
          options.onError(err, fields);
        }
      }
    }

    return { companiesFetched: companies.length, ...stats };
  } finally {
    db.release();
  }
}

module.exports = {
  syncContactsFromServiceM8,
  SYSTEM,
  EXTERNAL_ENTITY_TYPE,
};
