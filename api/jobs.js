/**
 * Jobs API - CRUD and listing for CRM jobs
 */

const { pool } = require('../lib/db');

async function listJobs(filters = {}) {
  const { customerId, status, fromDate, toDate, limit = 100, offset = 0 } = filters;
  const params = [];
  let paramIndex = 1;
  const conditions = [];

  if (customerId) {
    conditions.push(`customer_id = $${paramIndex}`);
    params.push(customerId);
    paramIndex++;
  }
  if (status) {
    conditions.push(`status ILIKE $${paramIndex}`);
    params.push(`%${status}%`);
    paramIndex++;
  }
  if (fromDate) {
    conditions.push(`job_date >= $${paramIndex}`);
    params.push(fromDate);
    paramIndex++;
  }
  if (toDate) {
    conditions.push(`job_date <= $${paramIndex}`);
    params.push(toDate);
    paramIndex++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const result = await pool.query(
    `SELECT id, servicem8_uuid, customer_id, job_date, job_type, job_value, status, address, notes, completed_at, created_at
     FROM jobs ${where}
     ORDER BY job_date DESC NULLS LAST
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    params
  );
  return result.rows;
}

async function getJobById(id) {
  const result = await pool.query(
    `SELECT * FROM jobs WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function getRecentlyCompletedJobs(daysSinceCompletion = 2) {
  const result = await pool.query(
    `SELECT j.*, c.name as customer_name, c.phone
     FROM jobs j
     JOIN customers c ON j.customer_id = c.id
     WHERE j.completed_at IS NOT NULL
       AND j.completed_at >= NOW() - INTERVAL '1 day' * $1`,
    [daysSinceCompletion]
  );
  return result.rows;
}

module.exports = {
  listJobs,
  getJobById,
  getRecentlyCompletedJobs,
};
