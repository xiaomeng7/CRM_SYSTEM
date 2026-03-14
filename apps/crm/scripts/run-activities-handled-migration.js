/**
 * Run 008_activities_handled.sql - add handled column for Reply Inbox.
 * Usage: pnpm --filter @bht/crm run db:activities-handled-migration
 */

const path = require('path');
const fs = require('fs');
require('../lib/load-env');
const { Pool } = require('pg');

const sql = fs.readFileSync(path.join(__dirname, '../database/008_activities_handled.sql'), 'utf8');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.query(sql)
  .then(() => { console.log('008_activities_handled done.'); pool.end(); })
  .catch((e) => { console.error(e.message); pool.end(); process.exit(1); });
