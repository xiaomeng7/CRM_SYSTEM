#!/usr/bin/env node
/**
 * PR8F — Discovery-first builder workflow tests.
 */

require('../lib/load-env');
const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');
const { createBuilderProspect } = require('../services/builder/builderProspectService');
const {
  inferProspectFieldsFromResearch,
  builderTypeFromAnalysis,
} = require('../services/builder/inferProspectFieldsFromResearch');
const {
  applyRelationshipDerivation,
  deriveRelationshipStage,
} = require('../services/builder/builderRelationshipDerivation');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'public/builder-intelligence.html');
const JS = path.join(ROOT, 'public/js/builder-intelligence.js');

const TEST_PREFIX = 'test_pr8f_';
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

function testUiFiles() {
  console.log('\n=== UI discovery workflow ===\n');
  const html = fs.readFileSync(HTML, 'utf8');
  const js = fs.readFileSync(JS, 'utf8');
  assert(html.includes('bi-add-form'), 'add form');
  assert(html.includes('Save &amp; Research') || html.includes('Save & Research'), 'save and research button');
  assert(html.includes('Contact Discovery'), 'contact discovery section');
  assert(html.includes('Research Results'), 'research results section');
  assert(html.includes('bi-builder-cards'), 'builder cards grid');
  assert(!html.includes('bi-filter-stage'), 'stage filter removed from founder UI');
  assert(js.includes('saveAddAndResearch'), 'save and research handler');
  assert(js.includes('auto_research: true'), 'auto research on create');
  assert(js.includes('renderBuilderCards'), 'builder cards renderer');
  assert(js.includes('detailSavePayload'), 'simplified detail save');
  console.log('UI OK');
}

function testInferFromResearch() {
  console.log('\n=== Infer prospect fields from research ===\n');
  const inferred = inferProspectFieldsFromResearch({
    builder_focus: 'architectural homes',
    project_types: ['architectural_new_build'],
    target_suburbs: ['Unley', 'Burnside'],
    estimated_fit_score: 82,
    fit_priority: 'high',
  });
  assert(inferred.research_status === 'researched', 'researched');
  assert(inferred.builder_type === 'architectural_homes', 'builder type');
  assert(inferred.project_focus === 'architectural_new_build', 'project focus');
  assert(inferred.opportunity_potential === 'strategic', 'opportunity strategic');
  assert(inferred.target_suburbs.includes('Unley'), 'target suburbs');
  assert(builderTypeFromAnalysis({ builder_focus: 'custom homes' }) === 'custom_homes', 'custom homes type');
  console.log('infer OK');
}

function testRelationshipDerivation() {
  console.log('\n=== Relationship derivation ===\n');
  const derived = applyRelationshipDerivation(
    { builder_status: 'strategic_partner', relationship_strength: 'trusted_partner' },
    { research_status: 'researched', fit_priority: 'high' }
  );
  assert(derived.relationship_stage === 'working_together', 'stage working_together');
  assert(derived.opportunity_potential === 'strategic', 'opportunity strategic');
  assert(
    deriveRelationshipStage('prospect', 'unknown', 'researched') === 'qualified',
    'researched prospect qualified'
  );
  console.log('derivation OK');
}

async function testMinimalCreate() {
  console.log('\n=== Minimal create payload ===\n');
  const p = await createBuilderProspect({
    company_name: `${TEST_PREFIX} KCW Build`,
    website: 'https://example-kcw.test',
    source: 'google_search',
    research_status: 'researching',
  });
  createdIds.push(p.id);
  assert(p.company_name.includes('KCW'), 'created');
  assert(p.website.includes('example-kcw'), 'website saved');
  assert(p.builder_status === 'prospect', 'default prospect');
  assert(p.relationship_stage === 'discovered', 'discovered stage');
  console.log('create OK');
}

async function main() {
  console.log('PR8F discovery workflow tests\n');
  try {
    testUiFiles();
    testInferFromResearch();
    testRelationshipDerivation();
    await cleanup();
    await testMinimalCreate();
    console.log('\n✓ All PR8F tests passed\n');
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
