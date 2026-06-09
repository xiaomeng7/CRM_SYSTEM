#!/usr/bin/env node
/**
 * PR8E — Builder target selection engine tests.
 *
 * Usage:
 *   pnpm --filter @bht/crm run test:builder-target-selection
 */

require('../lib/load-env');
const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');
const { createBuilderProspect } = require('../services/builder/builderProspectService');
const { upsertBuilderProfile } = require('../services/builder/builderProfileService');
const {
  calculateBuilderTargetScore,
  assignBand,
} = require('../services/builder/targetSelection/calculateBuilderTargetScore');
const { buildTargetAction } = require('../services/builder/targetSelection/buildTargetAction');
const { refreshBuilderTargetScores } = require('../services/builder/targetSelection/refreshBuilderTargetScores');
const { getTopBuilderTargets } = require('../services/builder/targetSelection/getTopBuilderTargets');
const {
  runBuilderPriorityDetector,
  eventKeyForProspect,
  EVENT_TYPE,
} = require('../services/operations/detectors/builderPriorityDetector');
const { generateEventActions } = require('../services/operations/generateEventActions');
const { upsertOperationalEvent } = require('../services/operations/upsertOperationalEvent');

const TEST_PREFIX = 'test_pr8e_';
const NOW = new Date('2026-06-08T12:00:00.000Z');
const createdProspectIds = [];
const createdEventKeys = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function daysAgo(n) {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

async function ensureMigrations() {
  const files = [
    '../database/069_builder_prospect_foundation.sql',
    '../database/070_builder_research_profiles.sql',
    '../database/071_builder_target_scores.sql',
    '../database/073_builder_relationship_intelligence.sql',
    '../database/074_builder_segmentation.sql',
    '../database/066_operational_events.sql',
    '../database/067_operational_events_event_key.sql',
    '../database/068_operational_event_actions.sql',
  ];
  for (const rel of files) {
    await pool.query(fs.readFileSync(path.join(__dirname, rel), 'utf8'));
  }
}

async function cleanup() {
  if (createdEventKeys.length) {
    await pool.query(`DELETE FROM operational_events WHERE event_key = ANY($1::text[])`, [
      createdEventKeys,
    ]);
  }
  if (createdProspectIds.length) {
    await pool.query(`DELETE FROM b2b_prospects WHERE id = ANY($1::uuid[])`, [createdProspectIds]);
  }
  await pool.query(`DELETE FROM b2b_prospects WHERE company_name LIKE $1`, [`${TEST_PREFIX}%`]);
}

async function testScoreCalculation() {
  console.log('\n=== Score calculation ===\n');

  const prospect = {
    relationship_stage: 'qualified',
    last_contacted_at: daysAgo(10),
    next_followup_at: daysAgo(5),
    research_status: 'researched',
  };
  const profile = { estimated_fit_score: 85, last_researched_at: daysAgo(20) };
  const openFollowupEvent = { payload: { overdue_days: 5 } };

  const result = calculateBuilderTargetScore({ prospect, profile, openFollowupEvent, now: NOW });

  assert(result.score_breakdown.components.length === 5, 'five components');
  const fit = result.score_breakdown.components.find((c) => c.component === 'research_fit');
  assert(fit.points === 34, `fit component 34, got ${fit.points}`);
  assert(result.target_score >= 80, `high score, got ${result.target_score}`);
  assert(result.target_band === 'A' || result.target_band === 'B', 'band A or B');
  console.log('score:', result.target_score, 'band:', result.target_band);
}

async function testBandAssignment() {
  console.log('\n=== Band assignment ===\n');

  assert(assignBand(95) === 'A', '95 = A');
  assert(assignBand(90) === 'A', '90 = A');
  assert(assignBand(80) === 'B', '80 = B');
  assert(assignBand(60) === 'C', '60 = C');
  assert(assignBand(30) === 'D', '30 = D');
  console.log('bands OK');
}

async function testActionGeneration() {
  console.log('\n=== Next best action ===\n');

  const prospect = { relationship_stage: 'qualified', last_contacted_at: null };
  const profile = { estimated_fit_score: 85 };
  const score = calculateBuilderTargetScore({
    prospect: { ...prospect, next_followup_at: daysAgo(3) },
    profile,
    openFollowupEvent: { payload: { overdue_days: 3 } },
    now: NOW,
  });
  assert(buildTargetAction(prospect, profile, score) === 'Call Builder', 'qualified overdue → Call');

  const intro = buildTargetAction(
    {
      relationship_stage: 'discovered',
      last_contacted_at: null,
      research_status: 'researched',
      relationship_strength: 'cold',
    },
    { estimated_fit_score: 80 },
    { founder_priority_band: 'B', score_breakdown: {} }
  );
  assert(intro === 'Call Builder', 'band B cold → Call Builder');

  const meeting = buildTargetAction(
    { relationship_stage: 'meeting_booked' },
    {},
    { score_breakdown: {} }
  );
  assert(meeting === 'Prepare Meeting', 'meeting → Prepare Meeting');
  console.log('actions OK');
}

async function testRankingAndRecalculate() {
  console.log('\n=== Ranking + recalculate ===\n');

  const high = await createBuilderProspect({
    company_name: `${TEST_PREFIX} High Target`,
    relationship_stage: 'qualified',
    relationship_strength: 'known',
    timing_status: 'quoting_projects',
    research_status: 'researched',
    last_contacted_at: daysAgo(7),
    next_followup_at: daysAgo(2),
    website: 'https://high.test',
  });
  createdProspectIds.push(high.id);
  await upsertBuilderProfile(high.id, {
    estimated_fit_score: 90,
    profile_summary: 'Premium builder',
    research_source: 'manual',
  });

  const low = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Low Target`,
    relationship_stage: 'discovered',
    research_status: 'not_started',
    website: 'https://low.test',
  });
  createdProspectIds.push(low.id);

  const stats = await refreshBuilderTargetScores({ now: NOW, log: () => {} });
  assert(stats.upserted >= 2, 'upserted scores');

  const { targets } = await getTopBuilderTargets({ limit: 10 });
  const testTargets = targets.filter((t) => t.company_name.startsWith(TEST_PREFIX));
  assert(testTargets.length >= 2, 'targets returned');
  assert(testTargets[0].company_name.includes('High'), 'high ranks first');
  assert(testTargets[0].target_score > testTargets[1].target_score, 'ranking order');
  console.log(
    'rank #1:',
    testTargets[0].company_name,
    testTargets[0].target_score,
    testTargets[0].next_best_action
  );
}

async function testEventGeneration() {
  console.log('\n=== builder_priority event ===\n');

  const prospect = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Event Target`,
    relationship_stage: 'qualified',
    relationship_strength: 'trusted_partner',
    timing_status: 'growth_mode',
    builder_status: 'prospect',
    research_status: 'researched',
    last_contacted_at: daysAgo(5),
    next_followup_at: daysAgo(35),
  });
  createdProspectIds.push(prospect.id);
  await upsertBuilderProfile(prospect.id, { estimated_fit_score: 95 });

  await refreshBuilderTargetScores({ now: NOW, log: () => {} });

  const detectorStats = await runBuilderPriorityDetector({ now: NOW, log: () => {} });
  assert(detectorStats.upserted >= 1, 'detector upserted');

  const key = eventKeyForProspect(prospect.id);
  createdEventKeys.push(key);

  const ev = await pool.query(
    `SELECT * FROM operational_events WHERE event_key = $1 AND status = 'open'`,
    [key]
  );
  assert(ev.rows[0], 'event exists');
  assert(ev.rows[0].event_type === EVENT_TYPE, 'event type');
  assert(Number(ev.rows[0].attention_score) >= 60, 'attention score');

  const actions = await generateEventActions({
    id: ev.rows[0].id,
    event_type: EVENT_TYPE,
    payload: ev.rows[0].payload,
  });
  assert(actions.generated >= 4, 'four actions');
  assert(actions.actions.some((a) => a.title === 'Call Builder'), 'call action');
  console.log('event OK:', ev.rows[0].title);
}

async function testStaleEventClosed() {
  console.log('\n=== Stale event closed ===\n');

  const prospect = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Stale Target`,
    relationship_stage: 'qualified',
  });
  createdProspectIds.push(prospect.id);

  const key = eventKeyForProspect(prospect.id);
  createdEventKeys.push(key);

  await upsertOperationalEvent({
    event_key: key,
    event_type: EVENT_TYPE,
    severity: 'high',
    attention_score: 92,
    source: 'test',
    title: 'Stale priority event',
    entity_type: 'b2b_prospect',
    entity_id: prospect.id,
    payload: { prospect_id: prospect.id },
  });

  await refreshBuilderTargetScores({
    now: NOW,
    log: () => {},
    runDetector: false,
  });

  const closed = await runBuilderPriorityDetector({ now: NOW, log: () => {} });
  assert(closed.closed_stale >= 0, 'detector ran');

  const open = await pool.query(
    `SELECT status FROM operational_events WHERE event_key = $1`,
    [key]
  );
  assert(open.rows[0].status === 'resolved', 'stale resolved');
  console.log('stale close OK');
}

async function main() {
  console.log('PR8E builder target selection tests\n');

  try {
    await ensureMigrations();
    await cleanup();

    await testScoreCalculation();
    await testBandAssignment();
    await testActionGeneration();
    await testRankingAndRecalculate();
    await testEventGeneration();
    await testStaleEventClosed();

    console.log('\n✓ All PR8E tests passed\n');
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
