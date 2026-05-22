/**
 * Run cashflow + bank migrations (063, 064, 065). Idempotent.
 * Use on Railway after deploy: pnpm --filter @bht/crm run db:bank-cashflow-migrations
 */
const path = require('path');
const fs = require('fs');
require('../lib/load-env');
const { Pool } = require('pg');

const FILES = [
  '063_cashflow_intelligence.sql',
  '064_bank_csv_import.sql',
  '065_recurring_patterns.sql',
];

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const dbDir = path.join(__dirname, '../database');
  for (const file of FILES) {
    const sql = fs.readFileSync(path.join(dbDir, file), 'utf8');
    console.log('Running', file, '...');
    await pool.query(sql);
    console.log(file, 'OK');
  }
  console.log('063–065 bank/cashflow migrations done.');
  await pool.end();
}

main().catch((e) => {
  console.error(e.message);
  pool.end();
  process.exit(1);
});
