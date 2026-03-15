/**
 * Run 025_quote_accepted_automation migration (opportunities.probability, tasks.task_type).
 * Usage: node scripts/run-quote-accepted-automation-migration.js
 */

const path = require('path');
const fs = require('fs');
require('../lib/load-env');
const { Pool } = require('pg');

const sql = fs.readFileSync(path.join(__dirname, '../database/025_quote_accepted_automation.sql'), 'utf8');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.query(sql)
  .then(() => { console.log('025_quote_accepted_automation done.'); pool.end(); })
  .catch((e) => { console.error(e.message); pool.end(); process.exit(1); });
