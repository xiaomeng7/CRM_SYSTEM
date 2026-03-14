/**
 * Run 005 and 006 customer segmentation view migrations.
 * Usage: node scripts/run-segmentation-migration.js
 */

require('../lib/load-env');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Missing DATABASE_URL. Set it in .env or the environment.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function main() {
  try {
    const dir = path.join(__dirname, '../database');
    for (const f of ['005_customer_segmentation_views.sql', '006_customer_segmentation_account_and_v2.sql', '007_account_reactivation_contacts.sql']) {
      const sqlPath = path.join(dir, f);
      const sql = fs.readFileSync(sqlPath, 'utf8');
      await pool.query(sql);
      console.log('Applied:', f);
    }
    console.log('Segmentation migrations (005, 006, 007) completed.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
