/**
 * Reply Classifier Worker
 * Processes unclassified inbound_sms activities: rule-first, then AI.
 *
 * Usage: node workers/reply-classifier-worker.js
 * Or: pnpm run reply-classifier (add script to package.json)
 */

require('../lib/load-env');
const { pool } = require('../lib/db');
const { classifyReply } = require('../services/replyClassifier');

const BATCH_SIZE = 20;
const SMS_INBOUND = ['inbound_sms', 'inbound_sms_unmatched'];

async function run() {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT id, summary FROM activities
       WHERE activity_type = ANY($1) AND COALESCE(intent_classified, false) = false
       ORDER BY occurred_at DESC
       LIMIT $2`,
      [SMS_INBOUND, BATCH_SIZE]
    );

    console.log(`Found ${res.rows.length} unclassified activities`);

    for (const row of res.rows) {
      const message = row.summary || '';
      try {
        const { intent, confidence, source } = await classifyReply(message);

        await client.query(
          `UPDATE activities
           SET intent = $1, intent_confidence = $2, intent_classified = true,
               intent_source = $3, classified_at = NOW(), updated_at = NOW()
           WHERE id = $4`,
          [intent, confidence, source, row.id]
        );

        console.log(`Classified ${row.id.slice(0, 8)}: intent=${intent} conf=${confidence} source=${source}`);
      } catch (err) {
        console.error(`Failed to classify ${row.id}:`, err.message);
      }
    }

    console.log('Reply classifier run completed');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
