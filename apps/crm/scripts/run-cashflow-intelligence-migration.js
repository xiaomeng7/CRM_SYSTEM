/**
 * Run 063_cashflow_intelligence migration.
 * Usage: node scripts/run-cashflow-intelligence-migration.js
 */

const path = require('path');
const fs = require('fs');
require('../lib/load-env');
const { Pool } = require('pg');

const sql = fs.readFileSync(path.join(__dirname, '../database/063_cashflow_intelligence.sql'), 'utf8');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool
  .query(sql)
  .then(() => {
    console.log('063_cashflow_intelligence done.');
    pool.end();
  })
  .catch((e) => {
    console.error(e.message);
    pool.end();
    process.exit(1);
  });
