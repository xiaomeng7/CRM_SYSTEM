/**
 * PostgreSQL database connection pool
 * CRM app — connects to Neon or Railway Postgres
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

module.exports = { pool };
