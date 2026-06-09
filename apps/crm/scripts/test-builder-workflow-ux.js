#!/usr/bin/env node
/**
 * PR8G.2 — Builder detail workflow UX (founder 3-question drawer).
 */

require('../lib/load-env');
const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');
const {
  createBuilderProspect,
  updateBuilderProspect,
  getBuilderProspectById,
} = require('../services/builder/builderProspectService');
const {
  deriveFieldsFromRelationshipLevel,
  inferRelationshipLevelFromProspect,
  RELATIONSHIP_LEVELS,
} = require('../services/builder/relationshipLevelMapping');
const { applyRelationshipDerivation } = require('../services/builder/builderRelationshipDerivation');
const { refreshBuilderTargetScoreForProspect } = require('../services/builder/targetSelection/refreshBuilderTargetScores');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'public/builder-intelligence.html');
const JS = path.join(ROOT, 'public/js/builder-intelligence.js');
const CSS = path.join(ROOT, 'public/css/builder-intelligence.css');
const TEST_PREFIX = 'test_pr8g2_';
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

function testWorkflowHtml() {
  console.log('\n=== HTML: workflow drawer sections ===\n');
  const html = fs.readFileSync(HTML, 'utf8');
  const detail = html.match(/<div class="bi-workflow">[\s\S]*?<\/div>\s*<input type="hidden" id="bi-decision_maker_name"/);
  assert(detail, 'workflow block');
  const block = detail[0];

  ['bi-section-discovery', 'bi-section-relationship', 'bi-section-opportunity', 'bi-section-research', 'bi-section-action'].forEach(
    (id) => assert(block.includes(id), `section ${id}`)
  );
  assert(block.includes('bi-relationship_level'), 'relationship level select');
  assert(block.includes('bi-timing_status'), 'timing status');
  assert(block.includes('bi-opportunity_potential'), 'opportunity potential');
  assert(!block.includes('id="bi-builder_status"') || block.includes('type="hidden" id="bi-builder_status"'), 'builder_status not visible');
  assert(html.includes('type="hidden" id="bi-builder_status"'), 'builder_status hidden');
  assert(html.includes('type="hidden" id="bi-relationship_strength"'), 'relationship_strength hidden');
  assert(!html.match(/<select[^>]+id="bi-builder_status"/), 'no builder_status select');
  assert(!html.match(/<select[^>]+id="bi-relationship_strength"/), 'no relationship_strength select');
  console.log('HTML OK');
}

function testWorkflowCss() {
  console.log('\n=== CSS: workflow grid layout ===\n');
  const css = fs.readFileSync(CSS, 'utf8');
  assert(css.includes('.bi-workflow-grid'), 'workflow grid');
  assert(css.includes('grid-template-columns: 1fr 1fr'), '2-column grid');
  assert(css.includes('.bi-field-full'), 'full-width fields');
  assert(css.includes('.bi-field-label'), 'labels above inputs');
  assert(css.includes('.bi-action-card'), 'action card');
  console.log('CSS OK');
}

function testWorkflowJs() {
  console.log('\n=== JS: relationship_level save flow ===\n');
  const js = fs.readFileSync(JS, 'utf8');
  assert(js.includes('relationship_level'), 'relationship_level in JS');
  assert(js.includes('renderRecommendedAction'), 'recommended action renderer');
  assert(js.includes('renderResearchResults'), 'research section renderer');
  assert(!js.includes('renderSummaryCard'), 'old summary card removed');
  assert(!js.includes('renderRelationshipScore'), 'old relationship score removed');
  assert(js.includes('bi-relationship_level'), 'relationship level field id');
  console.log('JS OK');
}

function testLevelMapping() {
  console.log('\n=== Relationship level → derived fields ===\n');
  RELATIONSHIP_LEVELS.forEach((level) => {
    const derived = deriveFieldsFromRelationshipLevel(level);
    assert(derived.relationship_strength, `${level} strength`);
    assert(derived.builder_status, `${level} status`);
    assert(derived.relationship_stage, `${level} stage`);
  });

  const worked = deriveFieldsFromRelationshipLevel('worked_together');
  assert(worked.builder_status === 'active_partner', 'worked_together → active_partner');
  assert(worked.relationship_strength === 'worked_together', 'worked_together strength');

  const strategic = deriveFieldsFromRelationshipLevel('strategic_partner');
  assert(strategic.builder_status === 'strategic_partner', 'strategic_partner status');

  const inferred = inferRelationshipLevelFromProspect({
    builder_status: 'prospect',
    relationship_strength: 'met_once',
    relationship_stage: 'contacted',
  });
  assert(inferred === 'met_once', 'infer met_once');
  console.log('mapping OK');
}

function testDerivationSkipsWhenLevelSet() {
  console.log('\n=== Derivation skips when level applied ===\n');
  const fromLevel = deriveFieldsFromRelationshipLevel('worked_together');
  const merged = applyRelationshipDerivation(fromLevel, { opportunity_potential: 'low' }, {
    derivedFromRelationshipLevel: true,
  });
  assert(merged.opportunity_potential === undefined, 'opportunity not auto-derived');
  assert(merged.builder_status === 'active_partner', 'status from level kept');
  console.log('derivation skip OK');
}

async function testUpdateViaRelationshipLevel() {
  console.log('\n=== PUT relationship_level updates internal fields ===\n');

  const p = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Level Update`,
    website: 'https://level-update.test',
    opportunity_potential: 'medium',
    timing_status: 'growth_mode',
  });
  createdIds.push(p.id);

  const updated = await updateBuilderProspect(p.id, {
    relationship_level: 'quoted',
    opportunity_potential: 'medium',
    timing_status: 'quoting_projects',
  });
  assert(updated.relationship_strength === 'known', 'quoted → known strength');
  assert(updated.builder_status === 'prospect', 'quoted stays prospect');
  assert(updated.relationship_stage === 'proposal_sent', 'quoted stage');
  assert(updated.opportunity_potential === 'medium', 'founder opportunity preserved');

  const fetched = await getBuilderProspectById(p.id);
  assert(fetched.relationship_level === 'quoted', 'GET returns relationship_level');

  await updateBuilderProspect(p.id, { relationship_level: 'trusted_partner' });
  const partner = await getBuilderProspectById(p.id);
  assert(partner.relationship_level === 'trusted_partner', 'trusted level');
  assert(partner.builder_status === 'active_partner', 'trusted → active partner');

  await refreshBuilderTargetScoreForProspect(p.id);
  const scored = await getBuilderProspectById(p.id);
  assert(scored.target_scores && scored.target_scores.score_kind === 'partner_value', 'partner scoring');
  console.log('update OK');
}

async function main() {
  console.log('PR8G.2 builder workflow UX tests\n');
  try {
    testWorkflowHtml();
    testWorkflowCss();
    testWorkflowJs();
    testLevelMapping();
    testDerivationSkipsWhenLevelSet();
    await cleanup();
    await testUpdateViaRelationshipLevel();
    console.log('\n✓ All PR8G.2 workflow UX tests passed\n');
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
