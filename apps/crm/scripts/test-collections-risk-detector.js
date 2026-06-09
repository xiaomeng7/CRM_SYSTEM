#!/usr/bin/env node
/**
 * PR7B — collections risk detector tests.
 *
 * Usage:
 *   pnpm --filter @bht/crm run test:collections-risk-detector
 */

require('../lib/load-env');
const { pool } = require('../lib/db');
const { upsertOperationalEvent } = require('../services/operations/upsertOperationalEvent');
const { closeStaleDetectorEvents } = require('../services/operations/closeResolvedEvents');
const {
  runCollectionsRiskDetector,
  computeCollectionsAttentionScore,
  severityFromAttention,
  eventKeyForInvoice,
  EVENT_TYPE,
} = require('../services/operations/detectors/collectionsRiskDetector');

const TEST_INVOICE_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEST_INVOICE_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TEST_INVOICE_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const createdEventIds = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function cleanup() {
  const keys = [TEST_INVOICE_A, TEST_INVOICE_B, TEST_INVOICE_C].map(eventKeyForInvoice);
  await pool.query(`DELETE FROM operational_events WHERE event_key = ANY($1::text[])`, [keys]);
}

function mockScanRows() {
  return [
    {
      invoice_id: TEST_INVOICE_A,
      account_id: null,
      job_id: null,
      invoice_number: '403',
      amount: 12500,
      invoice_date: '2026-01-01',
      due_date: '2026-02-01',
      overdue_level: '14_days',
      days_overdue: 37,
      contact_id: null,
      contact_name: 'Builder XYZ',
      contact_phone: null,
    },
    {
      invoice_id: TEST_INVOICE_B,
      account_id: null,
      job_id: null,
      invoice_number: '129',
      amount: 3200,
      invoice_date: '2026-04-01',
      due_date: '2026-05-01',
      overdue_level: '7_days',
      days_overdue: 21,
      contact_id: null,
      contact_name: 'Acme Pty Ltd',
      contact_phone: null,
    },
  ];
}

async function testScoring() {
  console.log('\n=== Scoring rules ===\n');

  const highRow = {
    amount: 12500,
    days_overdue: 37,
    overdue_level: '14_days',
    payment_risk: 'high',
  };
  const score = computeCollectionsAttentionScore(highRow);
  assert(score === 100, `expected max 100, got ${score}`);
  assert(severityFromAttention(score) === 'critical', 'severity critical');
  console.log('high-risk score:', score, 'severity:', severityFromAttention(score));

  const lowRow = { amount: 200, days_overdue: 5, overdue_level: 'none', payment_risk: null };
  const lowScore = computeCollectionsAttentionScore(lowRow);
  assert(lowScore === 30, `base only expected 30, got ${lowScore}`);
  assert(severityFromAttention(lowScore) === 'low', 'severity low');
  console.log('low-risk score:', lowScore);
}

async function testDetectorLifecycle() {
  console.log('\n=== Detector lifecycle (mock scan) ===\n');

  const staleKey = eventKeyForInvoice(TEST_INVOICE_C);
  const stale = await upsertOperationalEvent({
    event_key: staleKey,
    event_type: EVENT_TYPE,
    severity: 'medium',
    attention_score: 45,
    source: 'test',
    title: 'Stale invoice should close',
    summary: 'Previously at risk',
    entity_type: 'invoice',
    entity_id: TEST_INVOICE_C,
    payload: { invoice_id: TEST_INVOICE_C },
  });
  createdEventIds.push(stale.event.id);

  const stats = await runCollectionsRiskDetector({
    scanOverdueInvoices: async () => mockScanRows(),
    log: () => {},
  });

  assert(stats.scanned === 2, 'scanned count');
  assert(stats.upserted === 2, 'upserted count');
  assert(stats.active_keys.length === 2, 'active keys');
  assert(stats.closed_stale >= 1, 'stale event closed');

  const openKeys = await pool.query(
    `SELECT event_key, attention_score, severity, title, summary
     FROM operational_events
     WHERE event_type = $1 AND status = 'open'
     ORDER BY event_key`,
    [EVENT_TYPE]
  );

  const testOpen = openKeys.rows.filter((r) =>
    [eventKeyForInvoice(TEST_INVOICE_A), eventKeyForInvoice(TEST_INVOICE_B)].includes(r.event_key)
  );
  assert(testOpen.length === 2, 'two open test events');
  assert(
    !openKeys.rows.some((r) => r.event_key === staleKey),
    'stale key should be resolved'
  );

  const rowA = testOpen.find((r) => r.event_key === eventKeyForInvoice(TEST_INVOICE_A));
  assert(rowA.attention_score === 100, 'invoice A score');
  assert(rowA.severity === 'critical', 'invoice A severity');
  assert(rowA.summary.includes('37 days overdue'), 'summary includes days');
  console.log('open events:', testOpen.length, 'closed_stale:', stats.closed_stale);

  const stats2 = await runCollectionsRiskDetector({
    scanOverdueInvoices: async () => mockScanRows(),
    log: () => {},
  });
  assert(stats2.created === 0, 'second run should update not create');
  assert(stats2.updated === 2, 'second run updates');
  console.log('idempotent upsert OK');
}

async function testStaleCloseHelper() {
  console.log('\n=== closeStaleDetectorEvents ===\n');

  const key = eventKeyForInvoice('dddddddd-dddd-dddd-dddd-dddddddddddd');
  await upsertOperationalEvent({
    event_key: key,
    event_type: EVENT_TYPE,
    severity: 'low',
    attention_score: 30,
    source: 'test',
    title: 'To be closed as stale',
    entity_type: 'invoice',
    entity_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  });

  const closed = await closeStaleDetectorEvents({
    event_type: EVENT_TYPE,
    active_event_keys: [eventKeyForInvoice(TEST_INVOICE_A)],
  });
  assert(closed.stale_keys.includes(key), 'stale key listed');
  assert(closed.closed_count >= 1, 'closed');
  console.log('stale_keys:', closed.stale_keys.length);
}

async function main() {
  console.log('PR7B collections risk detector tests');
  await cleanup();
  try {
    await testScoring();
    await testDetectorLifecycle();
    await testStaleCloseHelper();
  } finally {
    await cleanup();
    await pool.end();
  }
  console.log('\nAll PR7B tests passed.');
}

main().catch((err) => {
  console.error('\nFAILED:', err.message || err);
  cleanup()
    .then(() => pool.end())
    .finally(() => process.exit(1));
});
