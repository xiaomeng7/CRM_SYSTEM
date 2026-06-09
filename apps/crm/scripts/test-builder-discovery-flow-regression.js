#!/usr/bin/env node
/**
 * PR8F.1 — Discovery flow regression (modal + founder field preservation).
 */

require('../lib/load-env');
const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');
const {
  createBuilderProspect,
  updateBuilderProspect,
} = require('../services/builder/builderProspectService');
const { upsertBuilderProfile } = require('../services/builder/builderProfileService');
const { updateProspectAfterResearch } = require('../services/builder/runBuilderResearch');
const { inferProspectFieldsFromResearch } = require('../services/builder/inferProspectFieldsFromResearch');
const { calculateFounderPriorityScore } = require('../services/builder/targetSelection/calculateFounderPriorityScore');
const { calculatePartnerValueScore } = require('../services/builder/targetSelection/calculatePartnerValueScore');
const { refreshBuilderTargetScoreForProspect } = require('../services/builder/targetSelection/refreshBuilderTargetScores');
const { DISCOVERY_CREATE_DEFAULTS } = require('../services/builder/builderProspectConstants');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'public/builder-intelligence.html');
const CSS = path.join(ROOT, 'public/css/builder-intelligence.css');
const TEST_PREFIX = 'test_pr8f1_';
const NOW = new Date('2026-06-09T12:00:00.000Z');
const createdIds = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function cleanup() {
  if (createdIds.length) {
    await pool.query(`DELETE FROM b2b_prospects WHERE id = ANY($1::uuid[])`, [createdIds]);
  }
  await pool.query(`DELETE FROM b2b_prospects WHERE company_name LIKE $1`, [`${TEST_PREFIX}%`]);
}

function testAddModalLayout() {
  console.log('\n=== Add modal simplified layout ===\n');
  const html = fs.readFileSync(HTML, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  assert(html.includes('bi-add-dialog'), 'add dialog container');
  assert(html.includes('bi-add-company_name'), 'company field');
  assert(html.includes('bi-add-website'), 'website field');
  assert(html.includes('bi-add-source'), 'source field');
  const addForm = html.match(/<form id="bi-add-form"[\s\S]*?<\/form>/);
  assert(addForm, 'add form block');
  assert(!addForm[0].includes('bi-form-grid'), 'no grid in add form');
  assert(!addForm[0].includes('bi-builder_status'), 'no relationship fields in add form');
  assert(css.includes('.bi-add-dialog'), 'add dialog CSS');
  assert(css.includes('max-width: 400px'), 'narrow modal width');
  assert(css.includes('.bi-add-field input'), 'full width inputs');
  console.log('modal OK');
}

function testInferResearchOnlyFields() {
  console.log('\n=== Research infers research-owned fields only ===\n');
  const inferred = inferProspectFieldsFromResearch({
    builder_focus: 'custom homes',
    project_types: ['custom_home'],
    estimated_fit_score: 67,
    fit_priority: 'medium',
    target_suburbs: ['Adelaide'],
  });
  assert(inferred.research_status === 'researched', 'research_status');
  assert(inferred.builder_type === 'custom_homes', 'builder_type');
  assert(inferred.opportunity_potential === undefined, 'no opportunity overwrite');
  assert(inferred.relationship_stage === undefined, 'no stage overwrite');
  console.log('infer OK');
}

async function testCreateDefaults() {
  console.log('\n=== Create safe defaults ===\n');
  const p = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Defaults Co`,
    website: 'https://defaults.test',
    source: 'google_search',
  });
  createdIds.push(p.id);
  assert(p.builder_status === DISCOVERY_CREATE_DEFAULTS.builder_status, 'prospect');
  assert(p.relationship_strength === DISCOVERY_CREATE_DEFAULTS.relationship_strength, 'unknown strength');
  assert(p.opportunity_potential === DISCOVERY_CREATE_DEFAULTS.opportunity_potential, 'medium opportunity');
  assert(p.timing_status === DISCOVERY_CREATE_DEFAULTS.timing_status, 'unknown timing');
  assert(p.relationship_stage === DISCOVERY_CREATE_DEFAULTS.relationship_stage, 'discovered');
  console.log('defaults OK');
}

async function testResearchPreservesFounderFields() {
  console.log('\n=== Research preserves founder-owned fields ===\n');

  const p = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Divinity Regression`,
    website: 'https://divinity-regression.test',
    relationship_strength: 'met_once',
    opportunity_potential: 'high',
    timing_status: 'growth_mode',
    relationship_stage: 'contacted',
    builder_status: 'prospect',
    founder_notes: 'Met at expo',
  });
  createdIds.push(p.id);
  await upsertBuilderProfile(p.id, { estimated_fit_score: 67, research_source: 'manual' });

  const updated = await updateProspectAfterResearch(
    p.id,
    {
      builder_focus: 'architectural homes',
      project_types: ['architectural_new_build'],
      estimated_fit_score: 67,
      fit_priority: 'medium',
      target_suburbs: ['Adelaide'],
    },
    pool
  );

  assert(updated.relationship_strength === 'met_once', 'strength preserved');
  assert(updated.opportunity_potential === 'high', 'opportunity preserved');
  assert(updated.timing_status === 'growth_mode', 'timing preserved');
  assert(updated.relationship_stage === 'contacted', 'stage preserved');
  assert(updated.founder_notes === 'Met at expo', 'founder notes preserved');
  assert(updated.builder_status === 'prospect', 'builder status preserved');
  assert(updated.fit_priority === 'medium', 'fit priority updated');
  assert(updated.research_status === 'researched', 'research status updated');
  console.log('preserve OK');
}

async function testScoreStableAfterResearch() {
  console.log('\n=== Score stable when founder fields unchanged ===\n');

  const p = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Score Stable`,
    website: 'https://score-stable.test',
    relationship_strength: 'met_once',
    opportunity_potential: 'high',
    timing_status: 'growth_mode',
    research_status: 'researched',
    relationship_stage: 'contacted',
  });
  createdIds.push(p.id);
  await upsertBuilderProfile(p.id, { estimated_fit_score: 67, research_source: 'manual' });

  const before = calculateFounderPriorityScore({
    prospect: p,
    profile: { estimated_fit_score: 67 },
    now: NOW,
  });

  await updateProspectAfterResearch(
    p.id,
    {
      builder_focus: 'custom homes',
      project_types: ['custom_home'],
      estimated_fit_score: 67,
      fit_priority: 'medium',
      target_suburbs: ['Adelaide'],
    },
    pool
  );

  await refreshBuilderTargetScoreForProspect(p.id, { now: NOW });
  const afterRow = await pool.query(
    `SELECT ts.founder_priority_score FROM builder_target_scores ts WHERE ts.prospect_id = $1`,
    [p.id]
  );
  const afterScore = Number(afterRow.rows[0].founder_priority_score);

  assert(before.founder_priority_score >= 50, `before score reasonable: ${before.founder_priority_score}`);
  assert(afterScore === before.founder_priority_score, `score unchanged: ${afterScore}`);
  console.log('score before/after:', before.founder_priority_score, afterScore);
}

async function testPartnerUnchangedAfterResearch() {
  console.log('\n=== Partner remains partner after research ===\n');

  const p = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Partner Co`,
    website: 'https://partner.test',
    builder_status: 'strategic_partner',
    relationship_strength: 'trusted_partner',
    opportunity_potential: 'strategic',
    timing_status: 'active_project',
    research_status: 'researched',
  });
  createdIds.push(p.id);
  await upsertBuilderProfile(p.id, { estimated_fit_score: 72, research_source: 'manual' });

  await updateProspectAfterResearch(
    p.id,
    {
      builder_focus: 'luxury residential',
      project_types: ['custom_home'],
      estimated_fit_score: 72,
      fit_priority: 'high',
    },
    pool
  );

  const refreshed = await refreshBuilderTargetScoreForProspect(p.id, { now: NOW });
  assert(refreshed.score_kind === 'partner_value', 'partner score kind');
  assert(refreshed.partner_value_band !== 'C', 'partner not band C');
  assert(refreshed.partner_value_band !== 'D', 'partner not band D');

  const row = await pool.query(`SELECT builder_status FROM b2b_prospects WHERE id = $1`, [p.id]);
  assert(row.rows[0].builder_status === 'strategic_partner', 'still strategic partner');
  console.log('partner OK:', refreshed.partner_value_score, refreshed.partner_value_band);
}

async function main() {
  console.log('PR8F.1 discovery flow regression tests\n');
  try {
    testAddModalLayout();
    testInferResearchOnlyFields();
    await cleanup();
    await testCreateDefaults();
    await testResearchPreservesFounderFields();
    await testScoreStableAfterResearch();
    await testPartnerUnchangedAfterResearch();
    console.log('\n✓ All PR8F.1 regression tests passed\n');
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
