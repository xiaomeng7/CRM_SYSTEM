#!/usr/bin/env node
/**
 * PR7A.1 — operational event priority / attention ranking tests.
 *
 * Usage:
 *   pnpm --filter @bht/crm run test:operational-event-priority
 */

require('../lib/load-env');
const { pool } = require('../lib/db');
const { createOperationalEvent } = require('../services/operations/createOperationalEvent');
const {
  listOperationalEventsByAttention,
  getOperationalEventsSummary,
} = require('../services/operations/eventService');
const {
  computeEffectiveAttentionScore,
  rankEventsByAttention,
} = require('../services/operations/eventPriority');

const TEST_PREFIX = 'test_pr7a1_';
const createdIds = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function cleanup() {
  if (!createdIds.length) return;
  await pool.query(`DELETE FROM operational_events WHERE id = ANY($1::uuid[])`, [createdIds]);
  createdIds.length = 0;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function testPriorityRules() {
  console.log('\n=== Priority rules ===\n');

  const now = new Date('2026-05-22T12:00:00Z');

  const criticalFresh = computeEffectiveAttentionScore(
    {
      event_type: 'collections_risk',
      severity: 'critical',
      attention_score: 10,
      detected_at: '2026-05-22T10:00:00Z',
      status: 'open',
    },
    now
  );
  assert(criticalFresh === 85, `critical+collections+1d expected 85, got ${criticalFresh}`);
  console.log('critical fresh collections:', criticalFresh);

  const lowOld = computeEffectiveAttentionScore(
    {
      event_type: 'sync_issue',
      severity: 'low',
      attention_score: 5,
      detected_at: '2026-01-01T00:00:00Z',
      status: 'open',
    },
    now
  );
  assert(lowOld === 10, `low+sync+old expected 10, got ${lowOld}`);
  console.log('low old sync:', lowOld);

  const resolved = computeEffectiveAttentionScore(
    {
      event_type: 'cashflow_risk',
      severity: 'critical',
      attention_score: 50,
      detected_at: '2026-05-22T10:00:00Z',
      status: 'resolved',
    },
    now
  );
  assert(resolved === 0, 'resolved events score 0');
  console.log('resolved → 0 OK');
}

async function testRankingAndApi() {
  console.log('\n=== Ranking + summary.top_attention ===\n');

  const eLow = await createOperationalEvent({
    event_type: 'sync_issue',
    severity: 'low',
    attention_score: 5,
    source: 'test',
    title: `${TEST_PREFIX} sync lag`,
    detected_at: daysAgo(20),
  });
  createdIds.push(eLow.id);

  const eHigh = await createOperationalEvent({
    event_type: 'cashflow_risk',
    severity: 'high',
    attention_score: 20,
    source: 'test',
    title: `${TEST_PREFIX} cashflow gap`,
    detected_at: daysAgo(2),
  });
  createdIds.push(eHigh.id);

  const eTop = await createOperationalEvent({
    event_type: 'collections_risk',
    severity: 'critical',
    attention_score: 30,
    source: 'test',
    title: `${TEST_PREFIX} overdue cluster`,
    detected_at: daysAgo(0),
  });
  createdIds.push(eTop.id);

  const ranked = await listOperationalEventsByAttention({
    status: 'open',
    limit: 20,
  });
  const ours = ranked.filter((e) => String(e.title || '').includes(TEST_PREFIX));
  assert(ours.length >= 3, 'expected 3 test events in ranked list');
  assert(ours[0].id === eTop.id, 'collections/critical should rank first');
  assert(
    (ours[0].effective_attention_score || 0) >= (ours[1].effective_attention_score || 0),
    'descending effective_attention_score'
  );
  console.log(
    'ranked:',
    ours.map((e) => ({
      title: e.title.replace(TEST_PREFIX, '').trim(),
      effective: e.effective_attention_score,
    }))
  );

  const summary = await getOperationalEventsSummary();
  assert(Array.isArray(summary.top_attention), 'top_attention array');
  assert(summary.top_attention.length <= 5, 'top_attention max 5');
  const topHasTest = summary.top_attention.some((e) => String(e.title || '').includes(TEST_PREFIX));
  console.log('summary.top_attention count:', summary.top_attention.length, 'includes test:', topHasTest);
  console.log(
    'top_attention sample:',
    summary.top_attention.slice(0, 3).map((e) => ({
      type: e.event_type,
      effective: e.effective_attention_score,
      title: (e.title || '').slice(0, 40),
    }))
  );

  const manualRank = rankEventsByAttention(ours);
  assert(manualRank[0].effective_attention_score >= manualRank[1].effective_attention_score);
  console.log('\nRanking OK');
}

async function testApiSmoke() {
  const base = (process.env.CRM_BASE_URL || '').replace(/\/$/, '');
  if (!base) {
    console.log('\n(skip API smoke — set CRM_BASE_URL)');
    return;
  }
  console.log('\n=== API smoke ===\n');

  const attRes = await fetch(`${base}/api/operational-events/attention?limit=10`);
  const attBody = await attRes.json();
  assert(attRes.ok && attBody.ok, 'GET /attention failed');
  assert(Array.isArray(attBody.events), 'events array');
  if (attBody.events.length > 1) {
    const a = attBody.events[0].effective_attention_score || 0;
    const b = attBody.events[1].effective_attention_score || 0;
    assert(a >= b, 'attention list sorted DESC');
  }
  console.log('GET /attention', attBody.count, 'events');

  const sumRes = await fetch(`${base}/api/operational-events/summary`);
  const sumBody = await sumRes.json();
  assert(sumRes.ok && sumBody.ok, 'GET /summary failed');
  assert(Array.isArray(sumBody.top_attention), 'summary.top_attention');
  console.log('GET /summary top_attention:', sumBody.top_attention.length);
}

async function main() {
  console.log('PR7A.1 operational event priority tests');
  try {
    await testPriorityRules();
    await testRankingAndApi();
    await testApiSmoke();
  } finally {
    await cleanup();
    await pool.end();
  }
  console.log('\nAll PR7A.1 tests passed.');
}

main().catch((err) => {
  console.error('\nFAILED:', err.message || err);
  cleanup()
    .then(() => pool.end())
    .finally(() => process.exit(1));
});
