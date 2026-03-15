#!/usr/bin/env node
/**
 * Test quote follow-up logic: list due, run dry-run, or seed test data.
 * Usage:
 *   node scripts/test-quote-followup.js list
 *   node scripts/test-quote-followup.js run-dry
 *   node scripts/test-quote-followup.js scenarios  (run scenario checks against DB)
 */

require('../lib/load-env');
const { pool } = require('../lib/db');
const { listQuotesDueForFollowUp, runQuoteFollowUps } = require('../services/quote-followup');

async function cmdList() {
  const rows = await listQuotesDueForFollowUp();
  console.log('Quotes due for follow-up:', rows.length);
  rows.forEach((r) => console.log(JSON.stringify({ quote_id: r.quote_id, opportunity_id: r.opportunity_id, sent_at: r.sent_at })));
  await pool.end();
}

async function cmdRunDry() {
  const result = await runQuoteFollowUps({ dryRun: true, sendSms: false, log: console.log });
  console.log('Dry run result:', result);
  await pool.end();
}

async function cmdScenarios() {
  const db = await pool.connect();
  try {
    const scenarios = [
      {
        name: 'sent > 7d, not accepted/declined → should be in due list',
        sql: `SELECT q.id FROM quotes q
              WHERE q.sent_at IS NOT NULL AND q.sent_at <= NOW() - INTERVAL '7 days'
                AND q.accepted_at IS NULL AND q.declined_at IS NULL
                AND (q.followup_state IS NULL OR q.followup_state NOT IN ('sent','skipped'))`,
      },
      {
        name: 'sent < 7d → should NOT be in due list',
        sql: `SELECT q.id FROM quotes q
              WHERE q.sent_at IS NOT NULL AND q.sent_at > NOW() - INTERVAL '7 days'`,
      },
      {
        name: 'accepted → should NOT be in due list',
        sql: `SELECT q.id FROM quotes q WHERE q.accepted_at IS NOT NULL`,
      },
      {
        name: 'declined → should NOT be in due list',
        sql: `SELECT q.id FROM quotes q WHERE q.declined_at IS NOT NULL`,
      },
      {
        name: 'followup_state = sent → should NOT be in due list',
        sql: `SELECT q.id FROM quotes q WHERE q.followup_state = 'sent'`,
      },
    ];

    for (const s of scenarios) {
      const r = await db.query(s.sql);
      console.log(`${s.name}: count=${r.rows.length}`);
    }

    const due = await listQuotesDueForFollowUp({ db });
    console.log('\nlistQuotesDueForFollowUp() returned:', due.length, 'rows');
  } finally {
    db.release();
    await pool.end();
  }
}

const cmd = process.argv[2] || 'list';
if (cmd === 'list') cmdList().catch((e) => { console.error(e); process.exit(1); });
else if (cmd === 'run-dry') cmdRunDry().catch((e) => { console.error(e); process.exit(1); });
else if (cmd === 'scenarios') cmdScenarios().catch((e) => { console.error(e); process.exit(1); });
else {
  console.log('Usage: node scripts/test-quote-followup.js list|run-dry|scenarios');
  process.exit(1);
}
