#!/usr/bin/env node
/**
 * PR7A — operational events storage layer tests.
 *
 * Usage:
 *   pnpm --filter @bht/crm run db:operational-events-migration
 *   pnpm --filter @bht/crm run test:operational-events
 *
 * Optional API smoke (server running):
 *   CRM_BASE_URL=http://localhost:3000 ADMIN_SECRET=... pnpm --filter @bht/crm run test:operational-events
 */

require('../lib/load-env');
const { pool } = require('../lib/db');
const { createOperationalEvent } = require('../services/operations/createOperationalEvent');
const { resolveOperationalEvent } = require('../services/operations/resolveOperationalEvent');
const {
  listOperationalEvents,
  getOperationalEventsSummary,
} = require('../services/operations/eventService');

const TEST_PREFIX = 'test_pr7a_';
const createdIds = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function cleanup() {
  if (!createdIds.length) return;
  await pool.query(`DELETE FROM operational_events WHERE id = ANY($1::uuid[])`, [createdIds]);
  createdIds.length = 0;
}

async function testServiceLayer() {
  console.log('\n=== Service layer ===\n');

  const e1 = await createOperationalEvent({
    event_type: 'collections_risk',
    severity: 'critical',
    attention_score: 85,
    source: 'test',
    title: `${TEST_PREFIX} Outstanding invoice cluster`,
    summary: 'Three large invoices overdue > 30 days',
    payload: { invoice_count: 3, total_amount: 12000 },
  });
  createdIds.push(e1.id);
  assert(e1.status === 'open', 'new event should be open');
  console.log('created:', e1.id, e1.event_type, e1.severity);

  const e2 = await createOperationalEvent({
    event_type: 'cashflow_risk',
    severity: 'high',
    attention_score: 60,
    source: 'test',
    title: `${TEST_PREFIX} Weekly gap detected`,
    payload: { gap_amount: 5500 },
  });
  createdIds.push(e2.id);
  console.log('created:', e2.id);

  const openList = await listOperationalEvents({
    status: 'open',
    event_type: 'collections_risk',
    limit: 10,
  });
  assert(openList.some((e) => e.id === e1.id), 'list should include collections_risk event');
  console.log('list open (collections_risk):', openList.length, 'row(s)');

  const summaryBefore = await getOperationalEventsSummary();
  assert(summaryBefore.open_count >= 2, 'summary open_count');
  assert(summaryBefore.critical_count >= 1, 'summary critical_count');
  assert(summaryBefore.high_count >= 1, 'summary high_count');
  assert(summaryBefore.attention_score >= 145, 'summary attention_score sum');
  console.log('summary before resolve:', summaryBefore);

  const resolved = await resolveOperationalEvent(e1.id, { status: 'resolved' });
  assert(resolved.status === 'resolved', 'resolved status');
  assert(resolved.resolved_at, 'resolved_at set');
  console.log('resolved:', resolved.id);

  const summaryAfter = await getOperationalEventsSummary();
  assert(summaryAfter.open_count === summaryBefore.open_count - 1, 'open_count decreased');
  console.log('summary after resolve:', summaryAfter);

  const dismissed = await resolveOperationalEvent(e2.id, { status: 'dismissed' });
  assert(dismissed.status === 'dismissed', 'dismissed status');
  console.log('dismissed:', dismissed.id);

  try {
    await resolveOperationalEvent(e1.id);
    throw new Error('expected NOT_OPEN on double resolve');
  } catch (err) {
    assert(err.code === 'NOT_OPEN', `expected NOT_OPEN, got ${err.code}`);
    console.log('double resolve blocked:', err.code);
  }

  console.log('\nService layer OK');
}

async function testApiSmoke() {
  const base = (process.env.CRM_BASE_URL || '').replace(/\/$/, '');
  if (!base) {
    console.log('\n(skip API smoke — set CRM_BASE_URL to enable)');
    return;
  }

  const secret = process.env.ADMIN_SECRET || process.env.SYNC_SECRET || '';
  const headers = { Accept: 'application/json' };
  if (secret) headers['x-admin-secret'] = secret;

  console.log('\n=== API smoke ===\n');
  console.log('Base:', base);

  const sumRes = await fetch(`${base}/api/operational-events/summary`, { headers });
  const sumBody = await sumRes.json();
  assert(sumRes.ok && sumBody.ok, 'GET summary failed');
  console.log('GET /summary', sumBody);

  const listRes = await fetch(`${base}/api/operational-events?status=open&limit=5`, { headers });
  const listBody = await listRes.json();
  assert(listRes.ok && listBody.ok, 'GET list failed');
  console.log('GET / (open)', listBody.count, 'events');

  if (createdIds.length) {
    const id = createdIds[createdIds.length - 1];
    const res = await fetch(`${base}/api/operational-events/${id}/resolve`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resolved' }),
    });
    const body = await res.json();
    if (secret) {
      assert(res.ok && body.ok, 'POST resolve failed');
      console.log('POST /:id/resolve', body.event?.status);
    } else {
      console.log('POST /:id/resolve', res.status, '(no secret in env)');
    }
  }

  console.log('\nAPI smoke OK');
}

async function main() {
  console.log('PR7A operational events tests');
  try {
    await testServiceLayer();
    await testApiSmoke();
  } finally {
    await cleanup();
    await pool.end();
  }
  console.log('\nAll PR7A tests passed.');
}

main().catch((err) => {
  console.error('\nFAILED:', err.message || err);
  cleanup()
    .then(() => pool.end())
    .finally(() => process.exit(1));
});
