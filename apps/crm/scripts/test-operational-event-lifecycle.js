#!/usr/bin/env node
/**
 * PR7A.2 — operational event identity / lifecycle tests.
 *
 * Usage:
 *   pnpm --filter @bht/crm run db:operational-events-lifecycle-migration
 *   pnpm --filter @bht/crm run test:operational-event-lifecycle
 */

require('../lib/load-env');
const { pool } = require('../lib/db');
const { upsertOperationalEvent } = require('../services/operations/upsertOperationalEvent');
const { closeResolvedEvents } = require('../services/operations/closeResolvedEvents');

const TEST_KEY = 'test_pr7a2:collections_risk:invoice:abc-123';
const createdIds = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function cleanup() {
  await pool.query(`DELETE FROM operational_events WHERE event_key = $1`, [TEST_KEY]);
  if (createdIds.length) {
    await pool.query(`DELETE FROM operational_events WHERE id = ANY($1::uuid[])`, [createdIds]);
    createdIds.length = 0;
  }
}

async function countOpenByKey() {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM operational_events WHERE event_key = $1 AND status = 'open'`,
    [TEST_KEY]
  );
  return r.rows[0].n;
}

async function main() {
  console.log('PR7A.2 operational event lifecycle tests\n');
  await cleanup();

  // 1) Duplicate event_key → single open row
  const first = await upsertOperationalEvent({
    event_key: TEST_KEY,
    event_type: 'collections_risk',
    severity: 'high',
    attention_score: 40,
    source: 'test',
    title: 'Invoice overdue',
    summary: '45 days overdue',
    payload: { days_overdue: 45 },
  });
  createdIds.push(first.event.id);
  assert(first.created && !first.updated, 'first upsert should create');

  const second = await upsertOperationalEvent({
    event_key: TEST_KEY,
    event_type: 'collections_risk',
    severity: 'high',
    attention_score: 40,
    source: 'test',
    title: 'Invoice overdue',
    summary: '45 days overdue',
    payload: { days_overdue: 45 },
  });
  assert(!second.created && second.updated, 'second upsert should update');
  assert(second.event.id === first.event.id, 'same row id');
  assert((await countOpenByKey()) === 1, 'only one open event per key');
  console.log('1) dedup OK — one open row');

  // 2) Update summary / attention_score / payload / detected_at
  const newer = new Date('2026-05-22T08:00:00Z');
  const third = await upsertOperationalEvent({
    event_key: TEST_KEY,
    event_type: 'collections_risk',
    severity: 'critical',
    attention_score: 72,
    source: 'test',
    title: 'Invoice overdue',
    summary: '60 days overdue — escalate',
    payload: { days_overdue: 60, amount: 12000 },
    detected_at: newer,
  });
  assert(third.updated, 'third upsert updates');
  assert(third.event.summary === '60 days overdue — escalate', 'summary updated');
  assert(third.event.attention_score === 72, 'attention_score updated');
  assert(third.event.payload.days_overdue === 60, 'payload updated');
  assert(
    new Date(third.event.detected_at).getTime() === newer.getTime(),
    'detected_at updated'
  );
  console.log('2) field updates OK');

  // 3) closeResolvedEvents
  const closed = await closeResolvedEvents({ event_keys: [TEST_KEY] });
  assert(closed.closed_count === 1, 'one event closed');
  assert(closed.events[0].status === 'resolved', 'status resolved');
  assert(closed.events[0].resolved_at, 'resolved_at set');
  assert((await countOpenByKey()) === 0, 'no open after close');
  console.log('3) closeResolvedEvents OK');

  // 4) After resolved, same key creates new open event
  const again = await upsertOperationalEvent({
    event_key: TEST_KEY,
    event_type: 'collections_risk',
    severity: 'medium',
    attention_score: 25,
    source: 'test',
    title: 'Invoice overdue again',
    summary: 'Re-opened after payment plan failed',
    payload: { days_overdue: 5 },
  });
  createdIds.push(again.event.id);
  assert(again.created, 'new open after resolve');
  assert(again.event.id !== first.event.id, 'new row id');
  assert(again.event.status === 'open', 'new event open');
  assert((await countOpenByKey()) === 1, 'one open again');
  console.log('4) re-open after resolve OK');

  const history = await pool.query(
    `SELECT id, status, event_key FROM operational_events WHERE event_key = $1 ORDER BY detected_at`,
    [TEST_KEY]
  );
  assert(history.rows.length >= 2, 'history has resolved + open rows');
  console.log('   history rows:', history.rows.length);

  await cleanup();
  await pool.end();
  console.log('\nAll PR7A.2 lifecycle tests passed.');
}

main().catch((err) => {
  console.error('\nFAILED:', err.message || err);
  cleanup()
    .then(() => pool.end())
    .finally(() => process.exit(1));
});
