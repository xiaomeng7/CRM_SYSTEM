#!/usr/bin/env node
/**
 * PR8E.1 — Founder priority & relationship intelligence tests.
 *
 * Usage:
 *   pnpm --filter @bht/crm run test:builder-founder-priority
 */

require('../lib/load-env');
const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');
const { createBuilderProspect, updateBuilderProspect } = require('../services/builder/builderProspectService');
const { upsertBuilderProfile } = require('../services/builder/builderProfileService');
const {
  calculateFounderPriorityScore,
  assignFounderPriorityBand,
  RELATIONSHIP_STRENGTH_POINTS,
} = require('../services/builder/targetSelection/calculateFounderPriorityScore');
const { buildTargetAction } = require('../services/builder/targetSelection/buildTargetAction');
const { refreshBuilderTargetScores } = require('../services/builder/targetSelection/refreshBuilderTargetScores');
const { getTopBuilderTargets } = require('../services/builder/targetSelection/getTopBuilderTargets');
const { getStrategicPartners } = require('../services/builder/targetSelection/getStrategicPartners');
const {
  runBuilderPriorityDetector,
  eventKeyForProspect,
  EVENT_TYPE,
} = require('../services/operations/detectors/builderPriorityDetector');
const { generateEventActions } = require('../services/operations/generateEventActions');

const TEST_PREFIX = 'test_pr8e1_';
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

async function testFounderPriorityFormula() {
  console.log('\n=== Founder priority formula ===\n');

  const result = calculateFounderPriorityScore({
    prospect: {
      relationship_strength: 'known',
      timing_status: 'quoting_projects',
      next_followup_at: daysAgo(5),
    },
    profile: { estimated_fit_score: 90 },
    openFollowupEvent: { payload: { overdue_days: 5 } },
    now: NOW,
  });

  assert(result.founder_priority_breakdown.components.length === 4, 'four weighted components');
  const fit = result.founder_priority_breakdown.components.find((c) => c.component === 'fit');
  assert(fit.points === 31.5, `fit 35% of 90 = 31.5, got ${fit.points}`);
  assert(result.founder_priority_score >= 75, `strong priority, got ${result.founder_priority_score}`);
  assert(assignFounderPriorityBand(90) === 'A', '90 = A');
  assert(assignFounderPriorityBand(75) === 'B', '75 = B');
  assert(assignFounderPriorityBand(60) === 'C', '60 = C');
  assert(assignFounderPriorityBand(59) === 'D', '59 = D');
  console.log('priority score:', result.founder_priority_score, 'band:', result.founder_priority_band);
}

async function testRelationshipOutranksFitOnly() {
  console.log('\n=== Relationship beats fit-only ===\n');

  const coldHighFit = calculateFounderPriorityScore({
    prospect: { relationship_strength: 'cold', timing_status: 'unknown' },
    profile: { estimated_fit_score: 95 },
    now: NOW,
  });

  const knownLowerFit = calculateFounderPriorityScore({
    prospect: { relationship_strength: 'known', timing_status: 'growth_mode' },
    profile: { estimated_fit_score: 75 },
    now: NOW,
  });

  assert(
    knownLowerFit.founder_priority_score > coldHighFit.founder_priority_score,
    `known/75 (${knownLowerFit.founder_priority_score}) > cold/95 (${coldHighFit.founder_priority_score})`
  );
  console.log('cold+95:', coldHighFit.founder_priority_score, 'known+75:', knownLowerFit.founder_priority_score);
}

async function testActionRulesV2() {
  console.log('\n=== Recommended actions V2 ===\n');

  assert(
    buildTargetAction(
      { relationship_strength: 'known', timing_status: 'unknown', relationship_stage: 'qualified' },
      { estimated_fit_score: 92 },
      { founder_priority_band: 'A' }
    ) === 'Arrange Meeting',
    'band A + known → Arrange Meeting'
  );

  assert(
    buildTargetAction(
      { relationship_strength: 'cold', timing_status: 'unknown', relationship_stage: 'discovered' },
      { estimated_fit_score: 80 },
      { founder_priority_band: 'B' }
    ) === 'Call Builder',
    'band B + cold → Call Builder'
  );

  assert(
    buildTargetAction(
      { relationship_strength: 'unknown', timing_status: 'quoting_projects', relationship_stage: 'contacted' },
      {},
      { founder_priority_band: 'C' }
    ) === 'Request Upcoming Tender Opportunities',
    'quoting_projects → tender request'
  );

  assert(
    buildTargetAction(
      {
        relationship_strength: 'worked_together',
        timing_status: 'unknown',
        relationship_stage: 'contacted',
        last_contacted_at: daysAgo(90),
      },
      {},
      { founder_priority_band: 'B' }
    ) === 'Reconnect',
    'worked_together idle → Reconnect'
  );

  console.log('action rules OK');
}

async function testRankingAndStrategic() {
  console.log('\n=== Ranking + strategic section ===\n');

  const relational = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Known Builder`,
    relationship_stage: 'qualified',
    relationship_strength: 'known',
    timing_status: 'quoting_projects',
    opportunity_potential: 'high',
    research_status: 'researched',
    last_contacted_at: daysAgo(14),
  });
  createdProspectIds.push(relational.id);
  await upsertBuilderProfile(relational.id, { estimated_fit_score: 78, research_source: 'manual' });

  const strategic = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Strategic Partner Co`,
    relationship_stage: 'qualified',
    relationship_strength: 'known',
    timing_status: 'growth_mode',
    opportunity_potential: 'strategic',
    builder_status: 'strategic_partner',
    research_status: 'researched',
  });
  createdProspectIds.push(strategic.id);
  await upsertBuilderProfile(strategic.id, { estimated_fit_score: 65, research_source: 'manual' });

  const coldFit = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Cold High Fit`,
    relationship_stage: 'discovered',
    relationship_strength: 'cold',
    opportunity_potential: 'medium',
    research_status: 'researched',
  });
  createdProspectIds.push(coldFit.id);
  await upsertBuilderProfile(coldFit.id, { estimated_fit_score: 92, research_source: 'manual' });

  await refreshBuilderTargetScores({ now: NOW, runDetector: false, log: () => {} });

  const { targets } = await getTopBuilderTargets({ limit: 20 });
  const testTargets = targets.filter((t) => t.company_name.startsWith(TEST_PREFIX));
  assert(testTargets.length >= 2, 'priorities returned');
  assert(
    testTargets[0].company_name.includes('Known') || testTargets[0].company_name.includes('Strategic'),
    'relationship/timing outranks cold high fit'
  );

  const { partners: strategicPartners } = await getStrategicPartners({ limit: 10 });
  const strategicRow = strategicPartners.find((p) => p.company_name.includes('Strategic'));
  assert(strategicRow, 'strategic partner listed');
  assert(strategicRow.builder_status === 'strategic_partner', 'strategic status');
  console.log('top:', testTargets[0].company_name, testTargets[0].founder_priority_score);
}

async function testBuilderPriorityEvent() {
  console.log('\n=== builder_priority event ===\n');

  const prospect = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Priority Event`,
    relationship_stage: 'qualified',
    relationship_strength: 'trusted_partner',
    timing_status: 'growth_mode',
    builder_status: 'prospect',
    research_status: 'researched',
    last_contacted_at: daysAgo(5),
    next_followup_at: daysAgo(35),
  });
  createdProspectIds.push(prospect.id);
  await upsertBuilderProfile(prospect.id, { estimated_fit_score: 95, research_source: 'manual' });

  await refreshBuilderTargetScores({ now: NOW, runDetector: false, log: () => {} });
  const stats = await runBuilderPriorityDetector({ now: NOW, log: () => {} });
  assert(stats.upserted >= 1, 'detector upserted');

  const key = eventKeyForProspect(prospect.id);
  createdEventKeys.push(key);

  const ev = await pool.query(
    `SELECT * FROM operational_events WHERE event_key = $1 AND status = 'open'`,
    [key]
  );
  assert(ev.rows[0], 'event exists');
  assert(ev.rows[0].event_type === EVENT_TYPE, 'builder_priority type');
  assert(ev.rows[0].title.includes('Top Prospect Priority'), 'prospect priority title');

  const actions = await generateEventActions({
    id: ev.rows[0].id,
    event_type: EVENT_TYPE,
    payload: ev.rows[0].payload,
  });
  assert(actions.generated >= 4, 'priority actions generated');
  assert(actions.actions.some((a) => a.title === 'Call Builder'), 'call action');
  assert(actions.actions.some((a) => a.title === 'Update Relationship Status'), 'update relationship');
  console.log('event OK');
}

async function testProspectFieldsPersist() {
  console.log('\n=== Prospect relationship fields ===\n');

  assert(RELATIONSHIP_STRENGTH_POINTS.known === 25, 'known = 25 points raw');

  const p = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Fields`,
    relationship_strength: 'met_once',
    opportunity_potential: 'high',
    timing_status: 'active_project',
    founder_notes: 'Met at HIA event',
  });
  createdProspectIds.push(p.id);

  assert(p.relationship_strength === 'met_once', 'strength saved');
  assert(p.founder_notes === 'Met at HIA event', 'founder notes saved');

  const updated = await updateBuilderProspect(p.id, {
    relationship_strength: 'trusted_partner',
    founder_notes: 'Calls back quickly',
  });
  assert(updated.relationship_strength === 'trusted_partner', 'strength updated');
  console.log('fields OK');
}

async function main() {
  console.log('PR8E.1 founder priority tests\n');

  try {
    await ensureMigrations();
    await cleanup();

    await testFounderPriorityFormula();
    await testRelationshipOutranksFitOnly();
    await testActionRulesV2();
    await testProspectFieldsPersist();
    await testRankingAndStrategic();
    await testBuilderPriorityEvent();

    console.log('\n✓ All PR8E.1 tests passed\n');
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
