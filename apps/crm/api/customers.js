/**
 * Customers API - CRUD and listing for CRM customers (legacy table).
 * When "customers" table does not exist, returns empty/null without hitting DB.
 */

const { pool } = require('../lib/db');

let _customersTableExists = null;

async function customersTableExists() {
  if (_customersTableExists !== null) return _customersTableExists;
  const r = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customers'`
  );
  _customersTableExists = r.rows.length > 0;
  return _customersTableExists;
}

async function listCustomers(filters = {}) {
  if (!(await customersTableExists())) return [];
  const { suburb, tags, limit = 100, offset = 0 } = filters;
  const params = [];
  let paramIndex = 1;
  const conditions = [];

  if (suburb) {
    conditions.push(`suburb ILIKE $${paramIndex}`);
    params.push(`%${suburb}%`);
    paramIndex++;
  }
  if (tags && tags.length) {
    conditions.push(`tags && $${paramIndex}`);
    params.push(tags);
    paramIndex++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const result = await pool.query(
    `SELECT id, servicem8_uuid, name, phone, email, suburb, postcode,
            first_job_date, last_job_date, total_jobs, total_revenue, tags, created_at, updated_at
     FROM customers ${where}
     ORDER BY last_job_date DESC NULLS LAST
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    params
  );
  return result.rows;
}

async function getCustomerById(id) {
  if (!(await customersTableExists())) return null;
  const result = await pool.query(
    `SELECT * FROM customers WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function getCustomerByServiceM8Uuid(uuid) {
  if (!(await customersTableExists())) return null;
  const result = await pool.query(
    `SELECT * FROM customers WHERE servicem8_uuid = $1`,
    [uuid]
  );
  return result.rows[0] || null;
}

async function updateCustomerTags(id, tags) {
  if (!(await customersTableExists())) return null;
  const result = await pool.query(
    `UPDATE customers SET tags = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [tags || [], id]
  );
  return result.rows[0] || null;
}

module.exports = {
  listCustomers,
  getCustomerById,
  getCustomerByServiceM8Uuid,
  updateCustomerTags,
};
