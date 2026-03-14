/**
 * Run 009_intent_classifier.sql
 */
const path = require('path');
const fs = require('fs');
require('../lib/load-env');
const { Pool } = require('pg');

const sql = fs.readFileSync(path.join(__dirname, '../database/009_intent_classifier.sql'), 'utf8');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.query(sql)
  .then(() => { console.log('009_intent_classifier done.'); pool.end(); })
  .catch((e) => { console.error(e.message); pool.end(); process.exit(1); });
