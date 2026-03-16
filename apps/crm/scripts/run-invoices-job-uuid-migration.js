/**
 * Run 027_invoices_servicem8_job_uuid migration (invoices.servicem8_job_uuid for job-derived rows).
 * Usage: node scripts/run-invoices-job-uuid-migration.js
 */

const path = require('path');
const fs = require('fs');
require('../lib/load-env');
const { Pool } = require('pg');

const sql = fs.readFileSync(path.join(__dirname, '../database/027_invoices_servicem8_job_uuid.sql'), 'utf8');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.query(sql)
  .then(() => { console.log('027_invoices_servicem8_job_uuid done.'); pool.end(); })
  .catch((e) => { console.error(e.message); pool.end(); process.exit(1); });
