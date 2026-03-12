/**
 * Run domain model migration (002_domain_model.sql) against DATABASE_URL.
 * Usage (from repo root):
 *   node apps/crm/scripts/run-domain-migration.js
 * Or from apps/crm:
 *   node scripts/run-domain-migration.js
 * Requires .env with DATABASE_URL, or set DATABASE_URL in the environment.
 */

const path = require('path');
const fs = require('fs');

// Load .env from monorepo root or cwd
require('../lib/load-env');

const { Pool } = require('pg');

const sqlPath = path.join(__dirname, '../database/002_domain_model.sql');
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
    console.log('Domain model migration (002_domain_model.sql) completed.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
