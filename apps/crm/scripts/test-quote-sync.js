#!/usr/bin/env node
/**
 * Test quote sync (dry run + webhook simulation).
 * Usage:
 *   node scripts/test-quote-sync.js
 *   node scripts/test-quote-sync.js --webhook job_uuid=<uuid> status=quote_sent
 */

require('../lib/load-env');
const { pool } = require('../lib/db');
const { syncQuotesFromServiceM8, processQuoteEvent } = require('../services/quote-sync');

async function run() {
  const args = process.argv.slice(2);
  const isWebhook = args.includes('--webhook');
  const dryRun = !args.includes('--apply');

  if (isWebhook) {
    const payload = {};
    for (const a of args) {
      if (a === '--webhook') continue;
      const [k, v] = a.split('=');
      if (k && v) payload[k] = v;
    }
    if (!payload.job_uuid && !payload.quote_uuid) {
      console.log('Usage: node test-quote-sync.js --webhook job_uuid=<uuid> status=quote_sent');
      process.exit(1);
    }
    const db = await pool.connect();
    try {
      const result = await processQuoteEvent(db, payload, { dryRun, log: console.log });
      console.log('Result:', result);
    } finally {
      db.release();
      await pool.end();
    }
    return;
  }

  console.log('Running quote sync (dryRun=%s)...', dryRun);
  const stats = await syncQuotesFromServiceM8({
    dryRun,
    log: console.log,
    onError: (e, ctx) => console.error('Error:', ctx, e.message),
  });
  console.log('Stats:', stats);
  await pool.end();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
