/**
 * Run 026_automation_settings migration.
 * Usage: node scripts/run-automation-settings-migration.js
 */

const path = require('path');
const fs = require('fs');
require('../lib/load-env');
const { Pool } = require('pg');

const sql = fs.readFileSync(path.join(__dirname, '../database/026_automation_settings.sql'), 'utf8');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.query(sql)
  .then(() => { console.log('026_automation_settings done.'); pool.end(); })
  .catch((e) => { console.error(e.message); pool.end(); process.exit(1); });
