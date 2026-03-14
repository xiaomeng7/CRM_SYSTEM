/**
 * Run 011_contacts_do_not_contact migration
 * Usage: pnpm --filter @bht/crm run db:do-not-contact-migration
 */

const path = require('path');
const fs = require('fs');
require('../lib/load-env');
const { Pool } = require('pg');

const sql = fs.readFileSync(path.join(__dirname, '../database/011_contacts_do_not_contact.sql'), 'utf8');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.query(sql)
  .then(() => { console.log('011_contacts_do_not_contact done.'); pool.end(); })
  .catch((e) => { console.error(e.message); pool.end(); process.exit(1); });
