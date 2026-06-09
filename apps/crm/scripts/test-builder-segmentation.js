#!/usr/bin/env node
/**
 * PR8E.3 — Builder segmentation (prospects vs partners) tests.
 *
 * Usage:
 *   pnpm --filter @bht/crm run test:builder-segmentation
 */

require('../lib/load-env');
const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');
const { createBuilderProspect, updateBuilderProspect } = require('../services/builder/builderProspectService');
const { upsertBuilderProfile } = require('../services/builder/builderProfileService');
const { calculatePartnerValueScore, assignPartnerValueBand } = require('../services/builder/targetSelection/calculatePartnerValueScore');
const { buildTargetAction } = require('../services/builder/targetSelection/buildTargetAction');
const { refreshBuilderTargetScores } = require('../services/builder/targetSelection/refreshBuilderTargetScores');
const { getTopBuilderTargets } = require('../services/builder/targetSelection/getTopBuilderTargets');
const { getStrategicPartners } = require('../services/builder/targetSelection/getStrategicPartners');
const { getActivePartners } = require('../services/builder/targetSelection/getActivePartners');
const { runBuilderPartnerDetector, eventKeyForProspect, EVENT_TYPE } = require('../services/operations/detectors/builderPartnerDetector');
const { generateEventActions } = require('../services/operations/generateEventActions');

const TEST_PREFIX = 'test_pr8e3_';
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

async function testPartnerValueScore() {
  console.log('\n=== Partner value score ===\n');

  const result = calculatePartnerValueScore({
    prospect: {
      builder_status: 'strategic_partner',
      relationship_strength: 'trusted_partner',
      opportunity_potential: 'strategic',
      timing_status: 'active_project',
    },
    profile: { estimated_fit_score: 90 },
    now: NOW,
  });

  assert(result.partner_value_score >= 85, `high partner score, got ${result.partner_value_score}`);
  assert(result.partner_value_band === 'A' || result.partner_value_band === 'B', 'band A or B');
  assert(result.partner_value_band !== 'C', 'strategic partner never Band C');
  console.log('partner score:', result.partner_value_score, 'band:', result.partner_value_band);
}

async function testPartnerActions() {
  console.log('\n=== Partner recommended actions ===\n');

  const strategic = buildTargetAction(
    {
      builder_status: 'strategic_partner',
      timing_status: 'active_project',
      relationship_strength: 'trusted_partner',
    },
    { estimated_fit_score: 90 },
    { partner_value_band: 'A' }
  );
  assert(strategic === 'Discuss Upcoming Projects', 'strategic + active project');

  const active = buildTargetAction(
    {
      builder_status: 'active_partner',
      timing_status: 'growth_mode',
      last_contacted_at: daysAgo(10),
    },
    {},
    { partner_value_band: 'B' }
  );
  assert(active === 'Share New Capability', 'active partner growth mode');

  const prospect = buildTargetAction(
    {
      builder_status: 'prospect',
      relationship_strength: 'cold',
      relationship_stage: 'discovered',
      research_status: 'researched',
    },
    { estimated_fit_score: 80 },
    { founder_priority_band: 'B' }
  );
  assert(prospect === 'Call Builder', 'prospect still uses prospect actions');
  console.log('actions OK');
}

async function testSegmentedRanking() {
  console.log('\n=== Segmented ranking ===\n');

  const ivara = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Ivara Homes`,
    builder_status: 'strategic_partner',
    relationship_strength: 'trusted_partner',
    opportunity_potential: 'strategic',
    timing_status: 'active_project',
    research_status: 'researched',
    last_contacted_at: daysAgo(10),
  });
  createdProspectIds.push(ivara.id);
  await upsertBuilderProfile(ivara.id, { estimated_fit_score: 92, research_source: 'manual' });

  const coldProspect = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Cold Prospect`,
    builder_status: 'prospect',
    relationship_strength: 'cold',
    research_status: 'researched',
  });
  createdProspectIds.push(coldProspect.id);
  await upsertBuilderProfile(coldProspect.id, { estimated_fit_score: 95, research_source: 'manual' });

  const active = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Active Partner Co`,
    builder_status: 'active_partner',
    relationship_strength: 'worked_together',
    timing_status: 'quoting_projects',
    research_status: 'researched',
  });
  createdProspectIds.push(active.id);
  await upsertBuilderProfile(active.id, { estimated_fit_score: 75, research_source: 'manual' });

  await refreshBuilderTargetScores({ now: NOW, runDetector: false, log: () => {} });

  const { targets } = await getTopBuilderTargets({ limit: 10 });
  const contactWeek = targets.filter((t) => t.company_name.startsWith(TEST_PREFIX));
  assert(contactWeek.length === 1, 'only prospect in Contact This Week');
  assert(contactWeek[0].company_name.includes('Cold'), 'prospect only in contact list');

  const { partners: strategic } = await getStrategicPartners({ limit: 10 });
  assert(strategic.some((p) => p.company_name.includes('Ivara')), 'Ivara in strategic partners');
  assert(strategic[0].partner_value_score >= 70, 'partner value not prospect score');

  const { partners: activePartners } = await getActivePartners({ limit: 10 });
  assert(activePartners.some((p) => p.company_name.includes('Active')), 'active partner listed');

  console.log('Ivara partner score:', strategic.find((p) => p.company_name.includes('Ivara')).partner_value_score);
}

async function testBuilderPartnerEvent() {
  console.log('\n=== builder_partner event ===\n');

  const p = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Partner Event`,
    builder_status: 'strategic_partner',
    relationship_strength: 'trusted_partner',
    timing_status: 'quoting_projects',
    last_contacted_at: daysAgo(70),
    research_status: 'researched',
  });
  createdProspectIds.push(p.id);
  await upsertBuilderProfile(p.id, { estimated_fit_score: 88, research_source: 'manual' });

  await refreshBuilderTargetScores({ now: NOW, runDetector: false, log: () => {} });
  const stats = await runBuilderPartnerDetector({ now: NOW, log: () => {} });
  assert(stats.upserted >= 1, 'partner event created');

  const key = eventKeyForProspect(p.id);
  createdEventKeys.push(key);

  const ev = await pool.query(
    `SELECT * FROM operational_events WHERE event_key = $1 AND status = 'open'`,
    [key]
  );
  assert(ev.rows[0].event_type === EVENT_TYPE, 'builder_partner type');
  assert(ev.rows[0].title.includes('Strategic Partner'), 'partner title');

  const actions = await generateEventActions({
    id: ev.rows[0].id,
    event_type: EVENT_TYPE,
    payload: ev.rows[0].payload,
  });
  assert(actions.generated >= 3, 'partner actions');
  console.log('event OK');
}

async function testBuilderStatusField() {
  console.log('\n=== builder_status field ===\n');

  const p = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Status Field`,
    builder_status: 'active_partner',
  });
  createdProspectIds.push(p.id);
  assert(p.builder_status === 'active_partner', 'status on create');

  const u = await updateBuilderProspect(p.id, { builder_status: 'strategic_partner' });
  assert(u.builder_status === 'strategic_partner', 'status updated');
  console.log('field OK');
}

async function main() {
  console.log('PR8E.3 builder segmentation tests\n');

  try {
    await ensureMigrations();
    await cleanup();

    await testPartnerValueScore();
    await testPartnerActions();
    await testBuilderStatusField();
    await testSegmentedRanking();
    await testBuilderPartnerEvent();

    console.log('\n✓ All PR8E.3 tests passed\n');
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
