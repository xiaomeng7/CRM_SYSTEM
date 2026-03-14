/**
 * Run 010_reactivation_sms_queue migration
 * Usage: pnpm --filter @bht/crm run db:reactivation-queue-migration
 */

const path = require('path');
const fs = require('fs');
require('../lib/load-env');
const { Pool } = require('pg');

const sql = fs.readFileSync(path.join(__dirname, '../database/010_reactivation_sms_queue.sql'), 'utf8');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool
  .query(sql)
  .then(() => {
    console.log('010_reactivation_sms_queue migration completed.');
    pool.end();
  })
  .catch((e) => {
    console.error(e.message);
    pool.end();
    process.exit(1);
  });
