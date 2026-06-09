#!/usr/bin/env node
/**
 * PR8B — builder follow-up detector tests.
 *
 * Usage:
 *   pnpm --filter @bht/crm run db:builder-prospect-migration
 *   pnpm --filter @bht/crm run db:operational-events-migration
 *   pnpm --filter @bht/crm run test:builder-followup-detector
 */

require('../lib/load-env');
const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');
const {
  runBuilderFollowupDetector,
  evaluateProspect,
  eventKeyForProspect,
  EVENT_TYPE,
} = require('../services/operations/detectors/builderFollowupDetector');
const { generateEventActions } = require('../services/operations/generateEventActions');
const { getOperationalEventById } = require('../services/operations/eventService');

const TEST_PREFIX = 'test_pr8b_';
const NOW = new Date('2026-06-08T12:00:00.000Z');
const createdProspectIds = [];
const createdEventKeys = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function daysAgo(n) {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

function daysAhead(n) {
  return new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000).toISOString();
}

async function ensureMigrations() {
  const files = [
    '../database/069_builder_prospect_foundation.sql',
    '../database/066_operational_events.sql',
    '../database/067_operational_events_event_key.sql',
    '../database/068_operational_event_actions.sql',
  ];
  for (const rel of files) {
    const p = path.join(__dirname, rel);
    if (fs.existsSync(p)) await pool.query(fs.readFileSync(p, 'utf8'));
  }
}

async function insertBuilderProspect(fields) {
  const r = await pool.query(
    `INSERT INTO b2b_prospects (
       company_name, prospect_type, relationship_stage, fit_priority,
       next_followup_at, last_contacted_at, builder_type, project_focus, suburb, website
     ) VALUES ($1, 'builder', $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      fields.company_name,
      fields.relationship_stage || 'discovered',
      fields.fit_priority || 'unknown',
      fields.next_followup_at ?? null,
      fields.last_contacted_at ?? null,
      fields.builder_type || 'luxury_residential',
      fields.project_focus || 'custom_home',
      fields.suburb || 'Unley',
      fields.website || 'https://example.test',
    ]
  );
  createdProspectIds.push(r.rows[0].id);
  return r.rows[0];
}

async function cleanup() {
  if (createdProspectIds.length) {
    await pool.query(`DELETE FROM b2b_prospects WHERE id = ANY($1::uuid[])`, [createdProspectIds]);
  }
  if (createdEventKeys.length) {
    await pool.query(`DELETE FROM operational_events WHERE event_key = ANY($1::text[])`, [
      createdEventKeys,
    ]);
  }
  await pool.query(`DELETE FROM operational_events WHERE title LIKE $1`, [`${TEST_PREFIX}%`]);
  await pool.query(`DELETE FROM b2b_prospects WHERE company_name LIKE $1`, [`${TEST_PREFIX}%`]);
}

async function getOpenEvent(prospectId) {
  const key = eventKeyForProspect(prospectId);
  const r = await pool.query(
    `SELECT * FROM operational_events WHERE event_key = $1 AND status = 'open'`,
    [key]
  );
  return r.rows[0] || null;
}

async function testRuleAOverdue() {
  console.log('\n=== Rule A — overdue next_followup ===\n');

  const p = await insertBuilderProspect({
    company_name: `${TEST_PREFIX} Overdue Builder`,
    relationship_stage: 'qualified',
    next_followup_at: daysAgo(20),
  });

  const match = evaluateProspect(p, NOW);
  assert(match && match.reason === 'next_followup_overdue', 'evaluateProspect Rule A');
  assert(match.severity === 'high', '20 days overdue = high');
  assert(match.attention_score === 65, '20 days overdue score 65');

  const stats = await runBuilderFollowupDetector({ now: NOW, log: () => {} });
  assert(stats.matched >= 1, 'detector matched');

  const event = await getOpenEvent(p.id);
  assert(event, 'event created');
  createdEventKeys.push(event.event_key);
  assert(event.event_type === EVENT_TYPE, 'event_type');
  assert(event.attention_score === 65, 'event score');
  assert(event.title.includes('Overdue Builder'), 'title');
  const payload = typeof event.payload === 'object' ? event.payload : JSON.parse(event.payload);
  assert(payload.reason === 'next_followup_overdue', 'payload reason');
  assert(payload.prospect_id === p.id, 'payload prospect_id');
  console.log('Rule A OK:', event.title);
}

async function testRuleBHighPriorityNoFollowup() {
  console.log('\n=== Rule B — high priority no follow-up date ===\n');

  const p = await insertBuilderProspect({
    company_name: `${TEST_PREFIX} High Priority No Date`,
    relationship_stage: 'discovered',
    fit_priority: 'high',
    next_followup_at: null,
  });

  const match = evaluateProspect(p, NOW);
  assert(match && match.reason === 'high_priority_no_followup', 'Rule B match');
  assert(match.severity === 'medium', 'severity medium');
  assert(match.attention_score === 45, 'score 45');

  await runBuilderFollowupDetector({ now: NOW, log: () => {} });
  const event = await getOpenEvent(p.id);
  assert(event, 'event created');
  createdEventKeys.push(event.event_key);
  assert(event.attention_score === 45, 'event score 45');
  assert(event.title.includes('no follow-up date'), 'title');
  console.log('Rule B OK:', event.title);
}

async function testRuleCContactedStale() {
  console.log('\n=== Rule C — contacted stale 14+ days ===\n');

  const p = await insertBuilderProspect({
    company_name: `${TEST_PREFIX} Stale Contacted`,
    relationship_stage: 'contacted',
    fit_priority: 'medium',
    next_followup_at: daysAhead(7),
    last_contacted_at: daysAgo(20),
  });

  const match = evaluateProspect(p, NOW);
  assert(match && match.reason === 'contacted_stale', 'Rule C match');
  assert(match.severity === 'high', 'severity high');
  assert(match.attention_score === 65, 'score 65');

  await runBuilderFollowupDetector({ now: NOW, log: () => {} });
  const event = await getOpenEvent(p.id);
  assert(event, 'event created');
  createdEventKeys.push(event.event_key);
  const payload = typeof event.payload === 'object' ? event.payload : JSON.parse(event.payload);
  assert(payload.reason === 'contacted_stale', 'payload reason');
  assert(event.title.includes('needs follow-up'), 'title');
  console.log('Rule C OK:', event.title);
}

async function testExcludedStages() {
  console.log('\n=== Excluded stages ignored ===\n');

  for (const stage of ['working_together', 'inactive', 'not_fit']) {
    const p = await insertBuilderProspect({
      company_name: `${TEST_PREFIX} Excluded ${stage}`,
      relationship_stage: stage,
      fit_priority: 'high',
      next_followup_at: daysAgo(30),
    });
    assert(evaluateProspect(p, NOW) === null, `${stage} not matched`);
  }

  await runBuilderFollowupDetector({ now: NOW, log: () => {} });

  const r = await pool.query(
    `SELECT oe.event_key
     FROM operational_events oe
     JOIN b2b_prospects bp ON bp.id = oe.entity_id
     WHERE bp.company_name LIKE $1 AND oe.status = 'open'`,
    [`${TEST_PREFIX} Excluded%`]
  );
  assert(r.rows.length === 0, 'no events for excluded stages');
  console.log('Excluded stages OK');
}

async function testStaleEventResolved() {
  console.log('\n=== Stale event resolved ===\n');

  const p = await insertBuilderProspect({
    company_name: `${TEST_PREFIX} Stale Resolve`,
    relationship_stage: 'qualified',
    next_followup_at: daysAgo(5),
  });

  await runBuilderFollowupDetector({ now: NOW, log: () => {} });
  let event = await getOpenEvent(p.id);
  assert(event, 'event open before fix');
  createdEventKeys.push(event.event_key);

  await pool.query(
    `UPDATE b2b_prospects SET relationship_stage = 'working_together', next_followup_at = $2 WHERE id = $1`,
    [p.id, daysAhead(14)]
  );

  const stats = await runBuilderFollowupDetector({ now: NOW, log: () => {} });
  assert(stats.closed_stale >= 1, 'closed stale');

  event = await getOpenEvent(p.id);
  assert(!event, 'event should be resolved');
  console.log('Stale resolve OK, closed_stale:', stats.closed_stale);
}

async function testActionGenerator() {
  console.log('\n=== Action generator ===\n');

  const p = await insertBuilderProspect({
    company_name: `${TEST_PREFIX} Action Gen`,
    relationship_stage: 'qualified',
    next_followup_at: daysAgo(3),
  });

  await runBuilderFollowupDetector({ now: NOW, log: () => {} });
  const row = await getOpenEvent(p.id);
  assert(row, 'event for actions');
  createdEventKeys.push(row.event_key);

  const event = await getOperationalEventById(row.id);
  const gen = await generateEventActions(event);
  assert(gen.generated === 4, `expected 4 actions, got ${gen.generated}`);
  assert(gen.actions.length === 4, 'four actions persisted');

  const types = gen.actions.map((a) => a.action_type);
  assert(types.includes('builder_call'), 'builder_call');
  assert(types.includes('builder_email_draft'), 'builder_email_draft');
  assert(types.includes('builder_review_profile'), 'builder_review_profile');
  assert(types.includes('builder_set_followup'), 'builder_set_followup');

  assert(gen.actions[0].title === 'Call builder', 'call title');
  assert(
    gen.actions[1].description.includes('personalised email'),
    'email draft description'
  );
  console.log('Action generator OK:', types.join(', '));
}

async function testOverdue30Days() {
  console.log('\n=== Overdue 30+ days scoring ===\n');

  const p = await insertBuilderProspect({
    company_name: `${TEST_PREFIX} Overdue 30d`,
    relationship_stage: 'contacted',
    next_followup_at: daysAgo(35),
  });

  const match = evaluateProspect(p, NOW);
  assert(match.attention_score === 75, '30+ day score 75');
  assert(match.severity === 'high', '30+ day severity high');
  console.log('30+ day scoring OK');
}

async function main() {
  console.log('PR8B builder follow-up detector tests\n');

  try {
    await ensureMigrations();
    await cleanup();

    await testRuleAOverdue();
    await testRuleBHighPriorityNoFollowup();
    await testRuleCContactedStale();
    await testOverdue30Days();
    await testExcludedStages();
    await testStaleEventResolved();
    await testActionGenerator();

    console.log('\n✓ All PR8B tests passed\n');
  } finally {
    await cleanup();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\n✗', err.message);
  cleanup()
    .then(() => pool.end())
    .finally(() => process.exit(1));
});
