#!/usr/bin/env node
/**
 * PR10A — Builder development pipeline tests.
 */

require('../lib/load-env');
const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');
const {
  inferPipelineStageFromProspect,
  getAdjacentPipelineStage,
  pipelineNextAction,
  deriveFieldsFromPipelineStage,
} = require('../services/builder/pipelineStageMapping');
const { PIPELINE_UI_SECTIONS, PIPELINE_SUMMARY_GROUPS } = require('../services/builder/pipelineStageConstants');
const {
  getBuilderPipelineView,
  transitionPipelineStage,
} = require('../services/builder/builderPipelineService');
const { createBuilderProspect } = require('../services/builder/builderProspectService');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'public/builder-intelligence.html');
const JS = path.join(ROOT, 'public/js/builder-intelligence.js');
const CSS = path.join(ROOT, 'public/css/builder-intelligence.css');
const TEST_PREFIX = 'test_pr10a_';
const createdProspectIds = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function ensureMigrations() {
  const sql = fs.readFileSync(
    path.join(__dirname, '../database/078_builder_development_pipeline.sql'),
    'utf8'
  );
  await pool.query(sql);
}

async function cleanup() {
  if (createdProspectIds.length) {
    await pool.query(`DELETE FROM builder_pipeline_activity WHERE prospect_id = ANY($1::uuid[])`, [
      createdProspectIds,
    ]);
    await pool.query(`DELETE FROM b2b_prospects WHERE id = ANY($1::uuid[])`, [createdProspectIds]);
  }
  await pool.query(`DELETE FROM b2b_prospects WHERE company_name LIKE $1`, [`${TEST_PREFIX}%`]);
}

function testMapping() {
  console.log('\n=== Pipeline stage mapping ===\n');
  assert(
    inferPipelineStageFromProspect({ builder_status: 'strategic_partner' }) === 'strategic_partner',
    'strategic partner maps'
  );
  assert(
    inferPipelineStageFromProspect({
      research_status: 'researched',
      contact_name: 'Jane',
    }) === 'contact_ready',
    'researched + contact → contact_ready'
  );
  assert(
    inferPipelineStageFromProspect({ research_status: 'researched' }) === 'contact_discovery',
    'researched no contact → contact_discovery'
  );
  assert(pipelineNextAction('contact_ready') === 'Call Builder', 'next action contact_ready');
  assert(getAdjacentPipelineStage('target', 'next') === 'contact_discovery', 'next from target');
  assert(getAdjacentPipelineStage('contact_discovery', 'previous') === 'target', 'prev to target');
  const fields = deriveFieldsFromPipelineStage('opportunity');
  assert(fields.relationship_stage === 'proposal_sent', 'opportunity derives proposal_sent');
  console.log('mapping OK');
}

function testUiAssets() {
  console.log('\n=== UI assets ===\n');
  const html = fs.readFileSync(HTML, 'utf8');
  const js = fs.readFileSync(JS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  assert(html.includes('bi-pipeline-summary'), 'HTML pipeline summary');
  assert(html.includes('bi-pipeline-sections'), 'HTML pipeline sections');
  assert(html.includes('bi-btn-pipeline-next'), 'HTML pipeline transition buttons');
  assert(js.includes('loadPipeline'), 'JS loadPipeline');
  assert(js.includes('/api/builder-intel/pipeline'), 'JS pipeline API');
  assert(js.includes('transitionPipelineStage'), 'JS stage transition');
  assert(css.includes('bi-pipeline-summary-grid'), 'CSS pipeline summary');
  assert(PIPELINE_UI_SECTIONS.length === 7, '7 pipeline UI sections defined');
  assert(PIPELINE_SUMMARY_GROUPS.length === 6, '6 pipeline summary groups defined');
  assert(html.includes('Builder Development Pipeline'), 'HTML pipeline heading');
  assert(html.includes('Builder Pipeline Summary') || js.includes('Builder Pipeline Summary'), 'pipeline summary title');
  console.log('UI assets OK');
}

async function testPipelineApi() {
  console.log('\n=== Pipeline API integration ===\n');
  const prospect = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Pipeline Builder`,
    website: 'https://example-pr10a.test',
    research_status: 'researched',
  });
  createdProspectIds.push(prospect.id);
  assert(prospect.pipeline_stage === 'contact_discovery', 'new researched builder in contact_discovery');

  const view = await getBuilderPipelineView({ db: pool });
  assert(view.summary && view.sections, 'pipeline view shape');
  assert(view.sections.length === PIPELINE_UI_SECTIONS.length, 'pipeline section count');

  const moved = await transitionPipelineStage(prospect.id, { direction: 'next' }, { db: pool });
  assert(moved.to_stage === 'contact_ready', 'transition next → contact_ready');
  assert(moved.activity && moved.activity.to_stage === 'contact_ready', 'activity logged');

  const movedBack = await transitionPipelineStage(prospect.id, { direction: 'previous' }, { db: pool });
  assert(movedBack.to_stage === 'contact_discovery', 'transition previous works');
  console.log('API integration OK');
}

async function main() {
  try {
    await ensureMigrations();
    testMapping();
    testUiAssets();
    await testPipelineApi();
    console.log('\nPR10A builder pipeline tests passed.\n');
  } finally {
    await cleanup();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  cleanup()
    .then(() => pool.end())
    .finally(() => process.exit(1));
});
