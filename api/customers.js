/**
 * Customers API - CRUD and listing for CRM customers
 */

const { pool } = require('../lib/db');

async function listCustomers(filters = {}) {
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
  const result = await pool.query(
    `SELECT * FROM customers WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function getCustomerByServiceM8Uuid(uuid) {
  const result = await pool.query(
    `SELECT * FROM customers WHERE servicem8_uuid = $1`,
    [uuid]
  );
  return result.rows[0] || null;
}

async function updateCustomerTags(id, tags) {
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
