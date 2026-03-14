/**
 * Run ServiceM8 history tables migration (003_servicem8_history.sql).
 * Creates jobs, invoices, job_materials and indexes.
 * Usage (from repo root): node apps/crm/scripts/run-servicem8-history-migration.js
 * From apps/crm: node scripts/run-servicem8-history-migration.js
 */

require('../lib/load-env');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const sqlPath = path.join(__dirname, '../database/003_servicem8_history.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Missing DATABASE_URL. Set it in .env or the environment.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function main() {
  try {
    await pool.query(sql);
    console.log('ServiceM8 history migration (003_servicem8_history.sql) completed.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
