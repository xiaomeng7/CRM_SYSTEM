/**
 * ServiceM8 → CRM sync (accounts from company.json, contacts from contact.json).
 * Only syncs real client data. No payment/invoice/expense APIs.
 * Idempotent, one-way. external_links: system=servicem8, external_entity_type=company, external_id=company.uuid → account.
 */

const { ServiceM8Client } = require('@bht/integrations');
const { pool } = require('../lib/db');
const { cleanAccount, cleanContact } = require('../lib/crm/cleaning');

const SYSTEM = 'servicem8';
const EXTERNAL_ENTITY_TYPE = 'company';
const SYNC_ADVISORY_LOCK_ID = 8273647123; // fixed bigint for pg advisory lock (servicem8 sync)

function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return null;
  return phone.replace(/\D/g, '').trim() || null;
}

function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return null;
  return email.trim().toLowerCase() || null;
}

/** company → account fields: name, address_line, suburb */
function companyToAccountFields(c) {
  const uuid = c.uuid || c.UUID;
  if (!uuid) return null;
  const name = (c.name || c.company_name || c.companyName || '').trim() || null;
  const address = (c.address || c.address_1 || c.address_street || c.street || '').trim() || null;
  const suburb = (c.city || c.address_suburb || c.suburb || c.addressSuburb || '').trim() || null;
  const postcode = (c.postcode || c.address_post_code || c.addressPostCode || c.post_code || '').trim() || null;
  return { servicem8_company_uuid: uuid, account_name: name, address_line: address, suburb, postcode };
}

/** contact → contact fields: name, phone, email; link via company_uuid. Phone: mobile first, then phone. */
function contactToFields(contact) {
  const companyUuid = contact.company_uuid || contact.companyUUID || contact.company;
  if (!companyUuid) return null;
  const name = (contact.name || '').trim() || null;
  const rawPhone = (contact.mobile || contact.Mobile || contact.phone || contact.Phone || contact.phone_number || '');
  const phone = (typeof rawPhone === 'string' ? rawPhone.trim() : '') || null;
  const email = (contact.email || '').trim() || null;
  return { company_uuid: companyUuid, contact_name: name, phone: phone || null, email };
}

/** When contact.json is not allowed, use companycontact.json and normalize to same shape. */
function normalizeCompanyContactsToContacts(raw) {
  const list = Array.isArray(raw) ? raw : (raw && raw.data) ? raw.data : [];
    return list.map((cc) => {
    const first = (cc.first || cc.first_name || '').trim();
    const last = (cc.last || cc.last_name || '').trim();
    const name = [first, last].filter(Boolean).join(' ') || (cc.name || '').trim() || null;
    const rawMobile = (cc.mobile || cc.Mobile || '').trim();
    const rawPhone = (cc.phone || cc.Phone || cc.phone_number || '').trim();
    const bestPhone = rawMobile || rawPhone || null;
    return {
      company_uuid: cc.company_uuid || cc.companyUUID || cc.company,
      name,
      mobile: rawMobile || null,
      phone: bestPhone,
      email: (cc.email || '').trim() || null,
    };
  }).filter((c) => c.company_uuid);
}

async function findAccountByExternalId(db, companyUuid) {
  const r = await db.query(
    `SELECT entity_id FROM external_links
     WHERE system = $1 AND external_entity_type = $2 AND external_id = $3`,
    [SYSTEM, EXTERNAL_ENTITY_TYPE, companyUuid]
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

async function upsertExternalLink(db, companyUuid, accountId, dryRun) {
  if (dryRun) return;
  await db.query(
    `INSERT INTO external_links (system, external_entity_type, external_id, entity_type, entity_id)
     VALUES ($1, $2, $3, 'account', $4)
     ON CONFLICT (system, external_entity_type, external_id)
     DO UPDATE SET entity_id = EXCLUDED.entity_id, updated_at = NOW()`,
    [SYSTEM, EXTERNAL_ENTITY_TYPE, companyUuid, accountId]
  );
}

/** Load company_uuid -> account_id from external_links. */
async function loadCompanyUuidToAccountId(db) {
  const r = await db.query(
    `SELECT external_id, entity_id FROM external_links
     WHERE system = $1 AND external_entity_type = $2`,
    [SYSTEM, EXTERNAL_ENTITY_TYPE]
  );
  const out = {};
  for (const row of r.rows) out[row.external_id] = row.entity_id;
  return out;
}

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function toArray(raw) {
  return Array.isArray(raw) ? raw : (raw && raw.data) ? raw.data : [raw].filter(Boolean);
}

/** If options.db provided, use it (caller owns release). Else acquire from pool and release in finally. */
async function getDb(options) {
  if (options.db) return { db: options.db, release: false };
  const db = await pool.connect();
  return { db, release: true };
}

/** Build OData $filter for incremental sync (e.g. last_modified_date gt 'YYYY-MM-DD'). */
function buildSinceFilter(since, field = 'last_modified_date') {
  if (!since) return '';
  const s = typeof since === 'string' ? since : (since instanceof Date ? since.toISOString().slice(0, 10) : '');
  return s ? `${field} gt '${s}'` : '';
}

// ---------- 1. Companies → accounts + external_links ----------
async function syncCompaniesFromServiceM8(options = {}) {
  const dryRun = Boolean(options.dryRun);
  const mode = options.mode || 'full';
  const { db, release } = await getDb(options);
  const client = new ServiceM8Client();
  const stats = { companies_fetched: 0, accounts_created: 0, accounts_updated: 0, skipped: 0, errors: 0 };
  try {
    const filter = mode === 'incremental' ? buildSinceFilter(options.since) : '';
    const raw = await client.getCompanies(filter);
    const companies = toArray(raw);
    stats.companies_fetched = companies.length;
    if (options.log) options.log(`Companies: fetched ${companies.length} (mode=${mode})`);

    for (const c of companies) {
      const fields = companyToAccountFields(c);
      if (!fields) { stats.skipped++; continue; }

      const cleaned = cleanAccount({
        name: fields.account_name,
        suburb: fields.suburb,
        address_line: fields.address_line,
        postcode: fields.postcode,
      });

      fields.account_name = cleaned.name;
      fields.suburb = cleaned.suburb;
      fields.address_line = cleaned.address_line;
      fields.postcode = cleaned.postcode;
      try {
        let accountId = await findAccountByExternalId(db, fields.servicem8_company_uuid);
        if (accountId) {
          if (!dryRun) {
            await db.query(
              `UPDATE accounts SET
                name = COALESCE(NULLIF(TRIM($1), ''), name),
                address_line = COALESCE(NULLIF(TRIM($2), ''), address_line),
                suburb = COALESCE(NULLIF(TRIM($3), ''), suburb),
                postcode = COALESCE(NULLIF(TRIM($4), ''), postcode),
                updated_at = NOW(), last_synced_at = NOW()
               WHERE id = $5`,
              [fields.account_name, fields.address_line, fields.suburb, fields.postcode, accountId]
            );
          }
          stats.accounts_updated++;
        } else {
          accountId = await findAccountByNameAndSuburb(db, fields.account_name, fields.suburb);
          if (accountId) {
            if (!dryRun) {
              await db.query(
                `UPDATE accounts SET
                  name = COALESCE(NULLIF(TRIM($1), ''), name),
                  address_line = COALESCE(NULLIF(TRIM($2), ''), address_line),
                  suburb = COALESCE(NULLIF(TRIM($3), ''), suburb),
                  postcode = COALESCE(NULLIF(TRIM($4), ''), postcode),
                  updated_at = NOW(), last_synced_at = NOW()
                 WHERE id = $5`,
                [fields.account_name, fields.address_line, fields.suburb, fields.postcode, accountId]
              );
              await upsertExternalLink(db, fields.servicem8_company_uuid, accountId, dryRun);
            }
            stats.accounts_updated++;
          } else {
            if (!dryRun) {
              const ins = await db.query(
                `INSERT INTO accounts (name, address_line, suburb, postcode, last_synced_at, created_by) VALUES ($1, $2, $3, $4, NOW(), $5) RETURNING id`,
                [fields.account_name, fields.address_line, fields.suburb, fields.postcode, 'servicem8-sync']
              );
              accountId = ins.rows[0].id;
              await upsertExternalLink(db, fields.servicem8_company_uuid, accountId, dryRun);
            }
            stats.accounts_created++;
          }
        }
      } catch (err) {
        stats.errors++;
        if (options.onError) options.onError(err, fields);
      }
    }
    return stats;
  } finally {
    if (release) db.release();
  }
}

// ---------- 2. Contacts → contacts (account_id via external_links) ----------
async function syncContactsFromServiceM8(options = {}) {
  const dryRun = Boolean(options.dryRun);
  const mode = options.mode || 'full';
  const { db, release } = await getDb(options);
  const client = new ServiceM8Client();
  const stats = {
    contacts_fetched: 0,
    contacts_created: 0,
    contacts_updated: 0,
    contacts_skipped_no_account: 0,
    skipped: 0,
    errors: 0,
  };
  try {
    const filter = mode === 'incremental' ? buildSinceFilter(options.since) : '';
    let contactsRaw;
    try {
      contactsRaw = await client.getContacts(filter);
    } catch (err) {
      const msg = (err && err.message) || '';
      if (options.log) options.log('contact.json failed: ' + msg);
      if (/contact is not an authorised object type|400/i.test(msg) && client.getCompanyContacts) {
        if (options.log) options.log('Using companycontact.json instead');
        contactsRaw = await client.getCompanyContacts().catch(() => []);
        contactsRaw = normalizeCompanyContactsToContacts(contactsRaw);
      } else {
        contactsRaw = [];
      }
    }
    const contacts = toArray(contactsRaw);
    stats.contacts_fetched = contacts.length;
    if (options.log) options.log(`Contacts: fetched ${contacts.length} (mode=${mode})`);

    const companyUuidToAccountId = await loadCompanyUuidToAccountId(db);

    for (const contact of contacts) {
      const fields = contactToFields(contact);
      if (!fields) { stats.skipped++; continue; }

      const cleaned = cleanContact({
        name: fields.contact_name,
        phone: fields.phone,
        email: fields.email,
      });

      if (cleaned.skip) {
        stats.skipped++;
        continue;
      }

      fields.contact_name = cleaned.name;
      fields.phone = cleaned.phone;
      fields.email = cleaned.email;
      const accountId = companyUuidToAccountId[fields.company_uuid] || (await findAccountByExternalId(db, fields.company_uuid));
      if (!accountId) { stats.contacts_skipped_no_account++; continue; }

      try {
        const contactId = await findExistingContact(db, fields.phone, fields.email);
        if (contactId) {
          if (!dryRun) {
            await db.query(
              `UPDATE contacts SET
                name = COALESCE(NULLIF(TRIM($1), ''), name),
                email = COALESCE(NULLIF(TRIM($2), ''), email),
                phone = COALESCE(NULLIF(TRIM($3), ''), phone),
                account_id = $4,
                updated_at = NOW(), last_synced_at = NOW()
               WHERE id = $5`,
              [fields.contact_name || '', fields.email || '', fields.phone || '', accountId, contactId]
            );
          }
          stats.contacts_updated++;
        } else {
          if (!dryRun) {
            await db.query(
              `INSERT INTO contacts (account_id, name, email, phone, last_synced_at, created_by) VALUES ($1, $2, $3, $4, NOW(), $5)`,
              [accountId, fields.contact_name, fields.email || null, fields.phone || null, 'servicem8-sync']
            );
          }
          stats.contacts_created++;
        }
      } catch (err) {
        stats.errors++;
        if (options.onError) options.onError(err, fields);
      }
    }
    return stats;
  } finally {
    if (release) db.release();
  }
}

// ---------- 3. Jobs → jobs (account_id via external_links; contact_id optional) ----------
async function syncJobsFromServiceM8(options = {}) {
  const dryRun = Boolean(options.dryRun);
  const mode = options.mode || 'full';
  const { db, release } = await getDb(options);
  const client = new ServiceM8Client();
  const stats = { jobs_fetched: 0, jobs_created: 0, jobs_updated: 0, jobs_skipped_no_account: 0, skipped: 0, errors: 0 };
  try {
    const filter = mode === 'incremental' ? buildSinceFilter(options.since) : '';
    const raw = await client.getJobs(filter);
    const jobs = toArray(raw);
    stats.jobs_fetched = jobs.length;
    if (options.log) options.log(`Jobs: fetched ${jobs.length} (mode=${mode})`);

    const companyUuidToAccountId = await loadCompanyUuidToAccountId(db);

    for (const j of jobs) {
      const uuid = j.uuid || j.UUID;
      if (!uuid) { stats.skipped++; continue; }
      const companyUuid = j.company_uuid || j.companyUUID || j.company;
      const accountId = companyUuid ? (companyUuidToAccountId[companyUuid] || (await findAccountByExternalId(db, companyUuid))) : null;
      if (!accountId) { stats.jobs_skipped_no_account++; continue; }

      const description = (j.description || j.notes || j.diary_notes || '').trim() || null;
      const address_line = (j.address || j.address_street || j.site_address || j.siteAddress || '').trim() || null;
      const suburb = (j.city || j.suburb || j.address_suburb || j.addressSuburb || '').trim() || null;
      const status = (j.status || j.status_name || j.statusName || '').trim() || null;
      const job_number = (j.job_number || j.jobNumber || j.reference || '').trim() || null;
      const jobDate = parseDate(j.date || j.job_date || j.scheduled_start_date || j.scheduled_start || j.created_at);
      const completedAt = parseDate(j.completed_date || j.completed_at || j.finish_date);
      const contactId = null;

      try {
        const existing = await db.query(`SELECT id FROM jobs WHERE servicem8_job_uuid = $1`, [uuid]);
        if (existing.rows.length > 0) {
          if (!dryRun) {
            await db.query(
              `UPDATE jobs SET
                account_id = $1,
                contact_id = $2,
                job_number = COALESCE(NULLIF(TRIM($3), ''), job_number),
                description = COALESCE(NULLIF(TRIM($4), ''), description),
                address_line = COALESCE(NULLIF(TRIM($5), ''), address_line),
                suburb = COALESCE(NULLIF(TRIM($6), ''), suburb),
                status = COALESCE(NULLIF(TRIM($7), ''), status),
                job_date = COALESCE($8, job_date),
                completed_at = COALESCE($9, completed_at),
                updated_at = NOW(), last_synced_at = NOW()
               WHERE servicem8_job_uuid = $10`,
              [accountId, contactId, job_number, description, address_line, suburb, status, jobDate, completedAt, uuid]
            );
          }
          stats.jobs_updated++;
        } else {
          if (!dryRun) {
            await db.query(
              `INSERT INTO jobs (account_id, contact_id, servicem8_job_uuid, job_number, description, address_line, suburb, status, job_date, completed_at, last_synced_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
              [accountId, contactId, uuid, job_number, description, address_line, suburb, status, jobDate, completedAt]
            );
          }
          stats.jobs_created++;
        }
      } catch (err) {
        stats.errors++;
        if (options.onError) options.onError(err, { servicem8_job_uuid: uuid });
      }
    }
    return stats;
  } finally {
    if (release) db.release();
  }
}

// ---------- 4. Invoices → invoices (account_id + job_id) ----------
async function syncInvoicesFromServiceM8(options = {}) {
  const dryRun = Boolean(options.dryRun);
  const mode = options.mode || 'full';
  const { db, release } = await getDb(options);
  const client = new ServiceM8Client();
  const stats = { invoices_fetched: 0, invoices_created: 0, invoices_updated: 0, skipped: 0, errors: 0 };
  try {
    const filter = mode === 'incremental' ? buildSinceFilter(options.since) : '';
    let raw;
    try {
      raw = await client.getInvoices(filter);
    } catch (err) {
      if (options.log) options.log('Invoices API failed: ' + (err && err.message));
      return stats;
    }
    const invoices = toArray(raw);
    stats.invoices_fetched = invoices.length;
    if (options.log) options.log(`Invoices: fetched ${invoices.length} (mode=${mode})`);

    const companyUuidToAccountId = await loadCompanyUuidToAccountId(db);
    const jobUuidToId = await db.query(`SELECT servicem8_job_uuid, id FROM jobs WHERE servicem8_job_uuid IS NOT NULL`).then((r) => {
      const m = {};
      for (const row of r.rows) m[row.servicem8_job_uuid] = row.id;
      return m;
    });

    for (const inv of invoices) {
      const uuid = inv.uuid || inv.UUID;
      if (!uuid) { stats.skipped++; continue; }
      const companyUuid = inv.company_uuid || inv.companyUUID || inv.company;
      const accountId = companyUuid ? (companyUuidToAccountId[companyUuid] || (await findAccountByExternalId(db, companyUuid))) : null;
      const jobUuid = inv.job_uuid || inv.jobUUID || inv.job;
      const jobId = jobUuid ? jobUuidToId[jobUuid] : null;

      const invoice_number = (inv.invoice_number || inv.invoiceNumber || inv.number || '').trim() || null;
      const amount = inv.total != null ? parseFloat(inv.total) : (inv.amount != null ? parseFloat(inv.amount) : null);
      const invoice_date = parseDate(inv.date || inv.invoice_date || inv.created_at);
      const status = (inv.status || inv.status_name || '').trim() || null;

      try {
        const existing = await db.query(`SELECT id FROM invoices WHERE servicem8_invoice_uuid = $1`, [uuid]);
        if (existing.rows.length > 0) {
          if (!dryRun) {
            await db.query(
              `UPDATE invoices SET account_id = $1, job_id = $2, invoice_number = $3, amount = $4, invoice_date = $5, status = $6, updated_at = NOW(), last_synced_at = NOW() WHERE servicem8_invoice_uuid = $7`,
              [accountId, jobId, invoice_number, amount, invoice_date, status, uuid]
            );
          }
          stats.invoices_updated++;
        } else {
          if (!dryRun) {
            await db.query(
              `INSERT INTO invoices (account_id, job_id, servicem8_invoice_uuid, invoice_number, amount, invoice_date, status, last_synced_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
              [accountId, jobId, uuid, invoice_number, amount, invoice_date, status]
            );
          }
          stats.invoices_created++;
        }
      } catch (err) {
        stats.errors++;
        if (options.onError) options.onError(err, { servicem8_invoice_uuid: uuid });
      }
    }
    return stats;
  } finally {
    if (release) db.release();
  }
}

// ---------- 5. Job materials → job_materials ----------
async function syncJobMaterialsFromServiceM8(options = {}) {
  const dryRun = Boolean(options.dryRun);
  const { db, release } = await getDb(options);
  const client = new ServiceM8Client();
  const stats = { job_materials_fetched: 0, job_materials_created: 0, job_materials_updated: 0, skipped: 0, errors: 0 };
  try {
    let raw;
    try {
      raw = await client.getJobMaterials();
    } catch (err) {
      if (options.log) options.log('JobMaterials API failed: ' + (err && err.message));
      return stats;
    }
    const materials = toArray(raw);
    stats.job_materials_fetched = materials.length;
    if (options.log) options.log(`Job materials: fetched ${materials.length}`);

    const jobUuidToId = await db.query(`SELECT servicem8_job_uuid, id FROM jobs WHERE servicem8_job_uuid IS NOT NULL`).then((r) => {
      const m = {};
      for (const row of r.rows) m[row.servicem8_job_uuid] = row.id;
      return m;
    });

    for (const m of materials) {
      const uuid = m.uuid || m.UUID;
      if (!uuid) { stats.skipped++; continue; }
      const jobUuid = m.job_uuid || m.jobUUID || m.job;
      const jobId = jobUuid ? jobUuidToId[jobUuid] : null;
      if (!jobId) { stats.skipped++; continue; }

      const material_name = (m.name || m.material_name || m.description || '').trim() || null;
      const quantity = m.qty != null ? parseFloat(m.qty) : (m.quantity != null ? parseFloat(m.quantity) : 1);
      const unit_price = m.unit_price != null ? parseFloat(m.unit_price) : null;
      const total_price = m.total != null ? parseFloat(m.total) : (m.total_price != null ? parseFloat(m.total_price) : (m.line_total != null ? parseFloat(m.line_total) : null));

      try {
        const existing = await db.query(`SELECT id FROM job_materials WHERE servicem8_job_material_uuid = $1`, [uuid]);
        if (existing.rows.length > 0) {
          if (!dryRun) {
            await db.query(
              `UPDATE job_materials SET job_id = $1, material_name = $2, quantity = $3, unit_price = $4, total_price = $5, updated_at = NOW() WHERE servicem8_job_material_uuid = $6`,
              [jobId, material_name, quantity, unit_price, total_price, uuid]
            );
          }
          stats.job_materials_updated++;
        } else {
          if (!dryRun) {
            await db.query(
              `INSERT INTO job_materials (job_id, servicem8_job_material_uuid, material_name, quantity, unit_price, total_price)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [jobId, uuid, material_name, quantity, unit_price, total_price]
            );
          }
          stats.job_materials_created++;
        }
      } catch (err) {
        stats.errors++;
        if (options.onError) options.onError(err, { servicem8_job_material_uuid: uuid });
      }
    }
    return stats;
  } finally {
    if (release) db.release();
  }
}

// ---------- Sync run recording ----------
async function insertSyncRun(db, options) {
  const dryRun = Boolean(options.dryRun);
  const mode = options.mode || 'full';
  const r = await db.query(
    `INSERT INTO sync_runs (sync_type, mode, dry_run, status)
     VALUES ($1, $2, $3, 'running') RETURNING id, started_at`,
    [options.sync_type || 'all', mode, dryRun]
  );
  return r.rows[0];
}

async function finishSyncRun(db, runId, stats, status = 'completed') {
  const fetched = (stats.companies_fetched || 0) + (stats.contacts_fetched || 0) + (stats.jobs_fetched || 0) + (stats.invoices_fetched || 0) + (stats.job_materials_fetched || 0);
  const created = (stats.accounts_created || 0) + (stats.contacts_created || 0) + (stats.jobs_created || 0) + (stats.invoices_created || 0) + (stats.job_materials_created || 0);
  const updated = (stats.accounts_updated || 0) + (stats.contacts_updated || 0) + (stats.jobs_updated || 0) + (stats.invoices_updated || 0) + (stats.job_materials_updated || 0);
  const skipped = stats.skipped || 0;
  const errors = stats.errors || 0;
  await db.query(
    `UPDATE sync_runs SET finished_at = NOW(), status = $1, fetched_count = $2, created_count = $3, updated_count = $4, skipped_count = $5, error_count = $6, details = $7
     WHERE id = $8`,
    [status, fetched, created, updated, skipped, errors, JSON.stringify(stats), runId]
  );
}

/** Acquire advisory lock for ServiceM8 sync. Returns true if acquired. */
async function acquireSyncLock(db) {
  const r = await db.query('SELECT pg_try_advisory_lock($1) AS acquired', [SYNC_ADVISORY_LOCK_ID]);
  return r.rows[0]?.acquired === true;
}

function releaseSyncLock(db) {
  return db.query('SELECT pg_advisory_unlock($1)', [SYNC_ADVISORY_LOCK_ID]);
}

// ---------- Full sync (all 5 in order, with lock + sync_runs), cron-ready ----------
async function syncAllFromServiceM8(options = {}) {
  const log = options.log || (() => {});
  const dryRun = Boolean(options.dryRun);
  const mode = options.mode || 'full';
  const skipLock = Boolean(options.skipLock);
  const db = await pool.connect();
  let runId;
  try {
    if (!skipLock) {
      const acquired = await acquireSyncLock(db);
      if (!acquired) {
        log('Sync skipped: another sync is running (advisory lock held).');
        return { locked: true, skipped: true };
      }
    }
    if (!dryRun) {
      const run = await insertSyncRun(db, { ...options, sync_type: 'all' });
      runId = run.id;
      log(`Sync run started: ${runId}`);
    }

    const syncOptions = { ...options, db, mode };
    if (mode === 'incremental' && options.since) syncOptions.since = options.since;
    else if (mode === 'incremental') {
      const r = await db.query(
        `SELECT finished_at FROM sync_runs WHERE sync_type = 'all' AND status = 'completed' AND dry_run = false ORDER BY finished_at DESC LIMIT 1`
      );
      if (r.rows[0]?.finished_at) syncOptions.since = r.rows[0].finished_at.toISOString().slice(0, 10);
    }

    const stats = {
      companies_fetched: 0,
      contacts_fetched: 0,
      jobs_fetched: 0,
      invoices_fetched: 0,
      job_materials_fetched: 0,
      accounts_created: 0,
      accounts_updated: 0,
      contacts_created: 0,
      contacts_updated: 0,
      jobs_created: 0,
      jobs_updated: 0,
      invoices_created: 0,
      invoices_updated: 0,
      job_materials_created: 0,
      job_materials_updated: 0,
      skipped: 0,
      errors: 0,
    };

    const s1 = await syncCompaniesFromServiceM8(syncOptions);
    stats.companies_fetched = s1.companies_fetched;
    stats.accounts_created = s1.accounts_created;
    stats.accounts_updated = s1.accounts_updated;
    stats.skipped += s1.skipped || 0;
    stats.errors += s1.errors || 0;

    const s2 = await syncContactsFromServiceM8(syncOptions);
    stats.contacts_fetched = s2.contacts_fetched;
    stats.contacts_created = s2.contacts_created;
    stats.contacts_updated = s2.contacts_updated;
    stats.skipped += s2.skipped || 0;
    stats.errors += s2.errors || 0;

    const s3 = await syncJobsFromServiceM8(syncOptions);
    stats.jobs_fetched = s3.jobs_fetched;
    stats.jobs_created = s3.jobs_created;
    stats.jobs_updated = s3.jobs_updated;
    stats.skipped += s3.skipped || 0;
    stats.errors += s3.errors || 0;

    const s4 = await syncInvoicesFromServiceM8(syncOptions);
    stats.invoices_fetched = s4.invoices_fetched;
    stats.invoices_created = s4.invoices_created;
    stats.invoices_updated = s4.invoices_updated;
    stats.skipped += s4.skipped || 0;
    stats.errors += s4.errors || 0;

    const s5 = await syncJobMaterialsFromServiceM8(syncOptions);
    stats.job_materials_fetched = s5.job_materials_fetched;
    stats.job_materials_created = s5.job_materials_created;
    stats.job_materials_updated = s5.job_materials_updated;
    stats.skipped += s5.skipped || 0;
    stats.errors += s5.errors || 0;

    if (runId) await finishSyncRun(db, runId, stats, stats.errors > 0 ? 'completed_with_errors' : 'completed');
    if (!skipLock) await releaseSyncLock(db).catch(() => {});
    return stats;
  } catch (err) {
    if (runId) await finishSyncRun(db, runId, {}, 'failed').catch(() => {});
    if (!skipLock) await releaseSyncLock(db).catch(() => {});
    throw err;
  } finally {
    db.release();
  }
}

/** Alias for full history sync (backward compatible). */
async function syncAllHistoryFromServiceM8(options = {}) {
  return syncAllFromServiceM8({ ...options, mode: 'full' });
}

// ---------- CRM → ServiceM8: ensure external link (avoid duplicate account/company) ----------
/**
 * Ensure CRM account has a ServiceM8 company link. If already linked, return company uuid.
 * If not: try to find existing ServiceM8 company by name+suburb; else create company in ServiceM8 and write external_links.
 * Call this before sending a lead/account to ServiceM8 so we do not create duplicate companies.
 */
async function ensureServiceM8LinkForAccount(accountId, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const db = options.db || await pool.connect();
  const releaseDb = !options.db;
  try {
    const existing = await db.query(
      `SELECT external_id FROM external_links
       WHERE system = $1 AND external_entity_type = $2 AND entity_type = 'account' AND entity_id = $3`,
      [SYSTEM, EXTERNAL_ENTITY_TYPE, accountId]
    );
    if (existing.rows[0]) return { companyUuid: existing.rows[0].external_id, created: false, linked: true };

    const acc = await db.query(
      `SELECT id, name, address_line, suburb, postcode FROM accounts WHERE id = $1`,
      [accountId]
    );
    if (!acc.rows[0]) return { companyUuid: null, created: false, linked: false };

    const account = acc.rows[0];
    const client = new ServiceM8Client();
    const companies = toArray(await client.getCompanies());
    const normName = (account.name || '').trim().toLowerCase();
    const normSuburb = (account.suburb || '').trim().toLowerCase();
    const match = companies.find((c) => {
      const n = (c.name || c.company_name || c.companyName || '').trim().toLowerCase();
      const s = (c.city || c.suburb || c.address_suburb || '').trim().toLowerCase();
      return n === normName && (normSuburb ? s === normSuburb : true);
    });
    if (match) {
      const uuid = match.uuid || match.UUID;
      if (uuid && !dryRun) {
        await db.query(
          `INSERT INTO external_links (system, external_entity_type, external_id, entity_type, entity_id)
           VALUES ($1, $2, $3, 'account', $4)
           ON CONFLICT (system, external_entity_type, external_id) DO UPDATE SET entity_id = EXCLUDED.entity_id, updated_at = NOW()`,
          [SYSTEM, EXTERNAL_ENTITY_TYPE, uuid, accountId]
        );
      }
      return { companyUuid: uuid, created: false, linked: !!uuid };
    }

    if (dryRun) return { companyUuid: null, created: true, linked: false };

    const body = {
      name: (account.name || '').trim() || 'Unknown',
      address_1: (account.address_line || '').trim() || undefined,
      city: (account.suburb || '').trim() || undefined,
      post_code: (account.postcode || '').trim() || undefined,
    };
    const { uuid } = await client.createCompany(body);
    await db.query(
      `INSERT INTO external_links (system, external_entity_type, external_id, entity_type, entity_id)
       VALUES ($1, $2, $3, 'account', $4)
       ON CONFLICT (system, external_entity_type, external_id) DO UPDATE SET entity_id = EXCLUDED.entity_id, updated_at = NOW()`,
      [SYSTEM, EXTERNAL_ENTITY_TYPE, uuid, accountId]
    );
    return { companyUuid: uuid, created: true, linked: true };
  } finally {
    if (releaseDb) db.release();
  }
}

module.exports = {
  syncCompaniesFromServiceM8,
  syncContactsFromServiceM8,
  syncJobsFromServiceM8,
  syncInvoicesFromServiceM8,
  syncJobMaterialsFromServiceM8,
  syncAllFromServiceM8,
  syncAllHistoryFromServiceM8,
  ensureServiceM8LinkForAccount,
  SYSTEM,
  EXTERNAL_ENTITY_TYPE,
};
