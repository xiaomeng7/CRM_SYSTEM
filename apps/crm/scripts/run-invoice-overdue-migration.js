/**
 * Run 021_invoice_overdue_automation migration (invoices.overdue_level, contacts.payment_risk).
 * Usage: node scripts/run-invoice-overdue-migration.js
 */

const path = require('path');
const fs = require('fs');
require('../lib/load-env');
const { Pool } = require('pg');

const sql = fs.readFileSync(path.join(__dirname, '../database/021_invoice_overdue_automation.sql'), 'utf8');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.query(sql)
  .then(() => { console.log('021_invoice_overdue_automation done.'); pool.end(); })
  .catch((e) => { console.error(e.message); pool.end(); process.exit(1); });
