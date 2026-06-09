/**
 * Run 073_builder_relationship_intelligence migration. Idempotent.
 * Usage: pnpm --filter @bht/crm run db:builder-relationship-intelligence-migration
 */
const path = require('path');
const fs = require('fs');
require('../lib/load-env');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const file = '073_builder_relationship_intelligence.sql';
  const sql = fs.readFileSync(path.join(__dirname, '../database', file), 'utf8');
  console.log('Running', file, '...');
  await pool.query(sql);
  console.log(file, 'OK');
  console.log('073 builder relationship intelligence migration done.');
  await pool.end();
}

main().catch((e) => {
  console.error(e.message);
  pool.end();
  process.exit(1);
});
