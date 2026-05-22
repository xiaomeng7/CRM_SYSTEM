/**
 * Run 064_bank_csv_import migration.
 */
const path = require('path');
const fs = require('fs');
require('../lib/load-env');
const { Pool } = require('pg');

const sql = fs.readFileSync(path.join(__dirname, '../database/064_bank_csv_import.sql'), 'utf8');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool
  .query(sql)
  .then(() => {
    console.log('064_bank_csv_import done.');
    pool.end();
  })
  .catch((e) => {
    console.error(e.message);
    pool.end();
    process.exit(1);
  });
