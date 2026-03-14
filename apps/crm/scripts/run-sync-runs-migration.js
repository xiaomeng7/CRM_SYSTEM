/**
 * Run sync_runs and last_synced_at migration (004_sync_runs_and_last_synced.sql).
 * Usage (from repo root): node apps/crm/scripts/run-sync-runs-migration.js
 * From apps/crm: node scripts/run-sync-runs-migration.js
 */

require('../lib/load-env');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const sqlPath = path.join(__dirname, '../database/004_sync_runs_and_last_synced.sql');
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
    console.log('Sync runs migration (004_sync_runs_and_last_synced.sql) completed.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
