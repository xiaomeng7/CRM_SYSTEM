#!/usr/bin/env node
/**
 * Customer Scoring Engine 2.0 — batch job.
 * Recalculates value/conversion/urgency/relationship scores and segment for all contacts.
 * Run daily via cron or AUTO_CUSTOMER_SCORING_DAILY=true in API.
 *
 * Usage (from apps/crm):
 *   node scripts/run-customer-scoring.js
 */

require('../lib/load-env');
const { pool } = require('../lib/db');
const { updateAllCustomerScores } = require('../services/customerScoringEngine');

async function onSegmentChange(payload, options) {
  const db = options.db || pool;
  const { contactId, previousSegment, newSegment } = payload;
  await db.query(
    `INSERT INTO automation_audit_log (event_type, entity_type, entity_id, source, payload, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [
      'customer_segment_change',
      'contact',
      contactId,
      'customer-scoring',
      JSON.stringify({ previousSegment, newSegment, contactId }),
    ]
  );
}

async function main() {
  console.log('Customer Scoring 2.0: updating all contact scores...');
  const result = await updateAllCustomerScores({
    log: console.log,
    onSegmentChange,
  });
  console.log('Done. Processed:', result.processed);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('run-customer-scoring failed:', err);
    process.exit(1);
  });
