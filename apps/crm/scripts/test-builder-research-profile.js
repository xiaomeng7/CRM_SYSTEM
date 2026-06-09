#!/usr/bin/env node
/**
 * PR8C — Builder Research Profile Foundation tests.
 *
 * Usage:
 *   pnpm --filter @bht/crm run db:builder-prospect-migration
 *   pnpm --filter @bht/crm run db:builder-research-migration
 *   pnpm --filter @bht/crm run test:builder-research-profile
 */

require('../lib/load-env');
const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');
const { createBuilderProspect } = require('../services/builder/builderProspectService');
const {
  getBuilderProfile,
  upsertBuilderProfile,
  listResearchRuns,
  createManualResearchRun,
} = require('../services/builder/builderProfileService');

const TEST_PREFIX = 'test_pr8c_';
const createdProspectIds = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function ensureMigrations() {
  const files = [
    '../database/069_builder_prospect_foundation.sql',
    '../database/070_builder_research_profiles.sql',
  ];
  for (const rel of files) {
    const p = path.join(__dirname, rel);
    if (fs.existsSync(p)) await pool.query(fs.readFileSync(p, 'utf8'));
  }
}

async function cleanup() {
  if (createdProspectIds.length) {
    await pool.query(`DELETE FROM b2b_prospects WHERE id = ANY($1::uuid[])`, [createdProspectIds]);
  }
  await pool.query(`DELETE FROM b2b_prospects WHERE company_name LIKE $1`, [`${TEST_PREFIX}%`]);
}

async function testMigrationAndCreateProspect() {
  console.log('\n=== Migration + create builder prospect ===\n');

  const p = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Research Builder`,
    suburb: 'Burnside',
    website: 'https://research-test.example',
    research_status: 'not_started',
    relationship_stage: 'discovered',
    fit_priority: 'high',
  });
  createdProspectIds.push(p.id);
  assert(p.research_status === 'not_started', 'starts not_started');
  console.log('created prospect:', p.id);
  return p;
}

async function testSaveAndGetProfile(prospectId) {
  console.log('\n=== Save + get research profile ===\n');

  const saved = await upsertBuilderProfile(prospectId, {
    profile_summary: 'Luxury custom homes in Adelaide Hills.',
    builder_focus: 'Architect-led residential',
    project_types: ['custom_home', 'architectural_new_build'],
    target_suburbs: ['Burnside', 'Unley'],
    quality_signals: ['architect partnerships', 'premium finishes'],
    risk_signals: ['small team'],
    ideal_contact_angle: 'Design-aware electrical partner',
    smart_home_fit: 'high',
    architectural_fit: 'high',
    luxury_fit: 'medium',
    estimated_fit_score: 78,
  });

  assert(saved.profile.profile_summary.includes('Luxury'), 'profile summary saved');
  assert(saved.profile.project_types.length === 2, 'project_types array');
  assert(saved.profile.estimated_fit_score === 78, 'fit score');
  assert(saved.prospect_research_status === 'researched', 'prospect synced to researched');
  assert(saved.profile.last_researched_at, 'last_researched_at set');

  const profile = await getBuilderProfile(prospectId);
  assert(profile.id === saved.profile.id, 'get profile');
  assert(profile.quality_signals.includes('architect partnerships'), 'quality signals');
  console.log('profile OK, score:', profile.estimated_fit_score);
}

async function testManualResearchRun(prospectId) {
  console.log('\n=== Manual research run ===\n');

  const run = await createManualResearchRun(prospectId, {
    summary: 'Manual desk research — reviewed website and project gallery.',
    input_url: 'https://research-test.example',
    payload: { notes: 'Found 3 luxury projects in Burnside', reviewer: 'founder' },
  });

  assert(run.status === 'completed', 'status completed');
  assert(run.source === 'manual', 'source manual');
  assert(run.summary.includes('Manual desk research'), 'summary');
  assert(run.payload.notes, 'payload persisted');

  const runs = await listResearchRuns(prospectId);
  assert(runs.length >= 1, 'list runs');
  assert(runs[0].id === run.id, 'latest run');
  console.log('manual run OK:', runs.length, 'run(s)');
}

async function testResearchStatusAlreadyResearched() {
  console.log('\n=== Existing prospect unaffected / status rules ===\n');

  const p = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Already Researched`,
    research_status: 'researched',
    relationship_stage: 'qualified',
  });
  createdProspectIds.push(p.id);

  const rental = await pool.query(
    `INSERT INTO b2b_prospects (company_name, prospect_type, outreach_status)
     VALUES ($1, 'rental_agency', 'not_contacted') RETURNING id`,
    [`${TEST_PREFIX} Rental Unaffected`]
  );
  createdProspectIds.push(rental.rows[0].id);

  const result = await upsertBuilderProfile(p.id, {
    profile_summary: 'Update without changing research status again.',
    estimated_fit_score: 55,
  });

  assert(result.prospect_research_status === null, 'no status change when already researched');

  const prospectRow = await pool.query(`SELECT research_status FROM b2b_prospects WHERE id = $1`, [
    p.id,
  ]);
  assert(prospectRow.rows[0].research_status === 'researched', 'still researched');

  const rentalProfile = await getBuilderProfile(rental.rows[0].id).catch((e) => {
    assert(e.code === 'NOT_FOUND', 'rental not a builder prospect');
    return null;
  });
  assert(rentalProfile === null, 'rental blocked from profile API');
  console.log('status + isolation OK');
}

async function testMarkResearched(prospectId) {
  console.log('\n=== Mark as researched ===\n');

  await pool.query(
    `UPDATE b2b_prospects SET research_status = 'researching' WHERE id = $1`,
    [prospectId]
  );

  const result = await upsertBuilderProfile(prospectId, { mark_researched: true });
  assert(result.profile.last_researched_at, 'last_researched_at updated');

  const row = await pool.query(`SELECT research_status FROM b2b_prospects WHERE id = $1`, [
    prospectId,
  ]);
  assert(row.rows[0].research_status === 'researched', 'mark_researched sets status');
  console.log('mark researched OK');
}

async function main() {
  console.log('PR8C Builder Research Profile tests\n');

  try {
    await ensureMigrations();
    await cleanup();

    const prospect = await testMigrationAndCreateProspect();
    await testSaveAndGetProfile(prospect.id);
    await testManualResearchRun(prospect.id);
    await testMarkResearched(prospect.id);
    await testResearchStatusAlreadyResearched();

    console.log('\n✓ All PR8C tests passed\n');
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
