/**
 * Run 066–067 operational_events migrations. Idempotent.
 * Usage: pnpm --filter @bht/crm run db:operational-events-migration
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
  const files = [
    '066_operational_events.sql',
    '067_operational_events_event_key.sql',
    '068_operational_event_actions.sql',
  ];
  const dbDir = path.join(__dirname, '../database');
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dbDir, file), 'utf8');
    console.log('Running', file, '...');
    await pool.query(sql);
    console.log(file, 'OK');
  }
  console.log('066–068 operational events migrations done.');
  await pool.end();
}

main().catch((e) => {
  console.error(e.message);
  pool.end();
  process.exit(1);
});
