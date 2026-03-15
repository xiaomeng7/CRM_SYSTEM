/**
 * Contacts service — list, get, update (manual 补全), from domain model (contacts + accounts).
 */

const { pool } = require('../lib/db');
const { normalizePhone, normalizePhoneDigits, normalizeEmail, normalizeName } = require('../lib/crm/cleaning');

let _contactsTableExists = null;

async function contactsTableExists() {
  if (_contactsTableExists !== null) return _contactsTableExists;
  const r = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contacts'`
  );
  _contactsTableExists = r.rows.length > 0;
  return _contactsTableExists;
}

function isValidUuid(s) {
  if (!s || typeof s !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

async function list(filters = {}) {
  if (!(await contactsTableExists())) return [];
  const { q, limit = 100, offset = 0 } = filters;
  const params = [];
  let paramIndex = 1;
  const conditions = [];

  // Always hide archived contacts by default
  conditions.push(`COALESCE(c.status, 'active') <> 'archived'`);

  if (q && (q + '').trim()) {
    const term = '%' + String(q).trim().replace(/%/g, '\\%') + '%';
    conditions.push(`(c.name ILIKE $${paramIndex} OR c.phone ILIKE $${paramIndex} OR c.email ILIKE $${paramIndex} OR a.suburb ILIKE $${paramIndex})`);
    params.push(term);
    paramIndex++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const result = await pool.query(
    `SELECT
       c.id,
       c.name,
       c.phone,
       c.email,
       c.account_id AS linked_account_id,
       a.name AS linked_account_name,
       a.suburb AS account_suburb,
       c.created_at
     FROM contacts c
     LEFT JOIN accounts a ON c.account_id = a.id
     ${where}
     ORDER BY c.created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    params
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    suburb: row.account_suburb,
    linked_account_id: row.linked_account_id,
    linked_account_name: row.linked_account_name,
    tags: [],
    reactivation_status: null,
    created_at: row.created_at,
  }));
}

async function getById(id) {
  if (!isValidUuid(id)) return null;
  if (!(await contactsTableExists())) return null;
  const result = await pool.query(
    `SELECT c.*, a.name AS linked_account_name, a.suburb AS account_suburb, c.do_not_contact
     FROM contacts c
     LEFT JOIN accounts a ON c.account_id = a.id
     WHERE c.id = $1
       AND COALESCE(c.status, 'active') <> 'archived'`,
    [id]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    suburb: row.account_suburb,
    linked_account_id: row.account_id,
    linked_account_name: row.linked_account_name,
    do_not_contact: !!row.do_not_contact,
    tags: [],
    reactivation_status: null,
    created_at: row.created_at,
  };
}

/**
 * Update contact fields (manual 补全). Only updates provided fields; normalizes phone → phone_digits.
 * @param {string} id - contact UUID
 * @param {Object} data - { name?, phone?, email? }
 */
async function update(id, data) {
  if (!isValidUuid(id)) return null;
  if (!(await contactsTableExists())) return null;
  const existing = await getById(id);
  if (!existing) return null;

  const updates = [];
  const params = [];
  let idx = 1;

  if (data.name !== undefined) {
    const name = normalizeName(data.name);
    updates.push(`name = $${idx}`);
    params.push(name !== undefined && name !== '' ? name : null);
    idx++;
  }
  if (data.phone !== undefined) {
    const raw = typeof data.phone === 'string' ? data.phone.trim() : '';
    const phone = raw ? (normalizePhone(raw) || raw) : null;
    updates.push(`phone = $${idx}`);
    params.push(phone);
    idx++;
  }
  if (data.email !== undefined) {
    const email = normalizeEmail(data.email);
    updates.push(`email = $${idx}`);
    params.push(email !== undefined && email !== '' ? email : null);
    idx++;
  }

  if (updates.length === 0) return existing;

  updates.push('updated_at = NOW()');
  params.push(id);

  await pool.query(
    `UPDATE contacts SET ${updates.join(', ')} WHERE id = $${idx}`,
    params
  );

  if (data.phone !== undefined) {
    const raw = typeof data.phone === 'string' ? data.phone.trim() : '';
    const digits = normalizePhoneDigits(raw || null);
    try {
      await pool.query(
        `UPDATE contacts SET phone_digits = $1, phone_raw = $2, updated_at = NOW() WHERE id = $3`,
        [digits, raw || null, id]
      );
    } catch (_) {
      // phone_digits/phone_raw may not exist if migration 018 not run
    }
  }
  return getById(id);
}

module.exports = { list, getById, update };
