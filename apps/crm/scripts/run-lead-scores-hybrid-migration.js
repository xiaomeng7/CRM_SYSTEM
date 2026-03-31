/**
 * Run 032_lead_scores_hybrid_scoring.sql (rule_score / ai_score / scoring_method + view).
 * Usage: node scripts/run-lead-scores-hybrid-migration.js
 */

const path = require('path');
const fs = require('fs');
require('../lib/load-env');
const { Pool } = require('pg');

const sql = fs.readFileSync(path.join(__dirname, '../database/032_lead_scores_hybrid_scoring.sql'), 'utf8');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool
  .query(sql)
  .then(() => {
    console.log('032_lead_scores_hybrid_scoring done.');
    return pool.end();
  })
  .catch((e) => {
    console.error(e.message);
    pool.end();
    process.exit(1);
  });
