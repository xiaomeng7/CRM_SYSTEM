#!/usr/bin/env node
/**
 * PR10C — Builder stage suggestion tests.
 */

require('../lib/load-env');
const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');
const {
  evaluateStageSuggestionRules,
  createStageSuggestion,
  suggestContactReadyAfterConfirm,
  refreshStageSuggestionsForProspect,
  approveStageSuggestion,
  dismissStageSuggestion,
  getPendingStageSuggestion,
} = require('../services/builder/builderStageSuggestionService');
const { getBuilderPipelineView } = require('../services/builder/builderPipelineService');
const { confirmBuilderContact, runContactDiscovery } = require('../services/builder/contactDiscovery/builderContactDiscoveryService');
const { createBuilderProspect } = require('../services/builder/builderProspectService');
const { SUGGESTION_SOURCES } = require('../services/builder/stageSuggestionConstants');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'public/builder-intelligence.html');
const JS = path.join(ROOT, 'public/js/builder-intelligence.js');
const CSS = path.join(ROOT, 'public/css/builder-intelligence.css');
const TEST_PREFIX = 'test_pr10c_';
const createdProspectIds = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function ensureMigrations() {
  const files = ['079_builder_contact_discovery.sql', '080_builder_stage_suggestions.sql'];
  for (const file of files) {
    const sql = fs.readFileSync(path.join(__dirname, '../database', file), 'utf8');
    await pool.query(sql);
  }
}

async function cleanup() {
  if (createdProspectIds.length) {
    await pool.query(`DELETE FROM builder_stage_suggestions WHERE prospect_id = ANY($1::uuid[])`, [
      createdProspectIds,
    ]);
    await pool.query(`DELETE FROM builder_contacts WHERE prospect_id = ANY($1::uuid[])`, [createdProspectIds]);
    await pool.query(`DELETE FROM builder_contact_discovery_runs WHERE prospect_id = ANY($1::uuid[])`, [
      createdProspectIds,
    ]);
    await pool.query(`DELETE FROM builder_pipeline_activity WHERE prospect_id = ANY($1::uuid[])`, [
      createdProspectIds,
    ]);
    await pool.query(`DELETE FROM b2b_prospects WHERE id = ANY($1::uuid[])`, [createdProspectIds]);
  }
  await pool.query(`DELETE FROM b2b_prospects WHERE company_name LIKE $1`, [`${TEST_PREFIX}%`]);
}

function testRuleEvaluation() {
  console.log('\n=== Rule evaluation ===\n');
  const callSuggestion = evaluateStageSuggestionRules({
    pipeline_stage: 'contact_ready',
    last_contacted_at: '2026-01-01T00:00:00Z',
  });
  assert(callSuggestion.some((s) => s.suggested_to_stage === 'relationship_building'), 'call → relationship');

  const projectSuggestion = evaluateStageSuggestionRules({
    pipeline_stage: 'relationship_building',
    founder_notes: 'Discussed renovation project quote',
  });
  assert(projectSuggestion.some((s) => s.suggested_to_stage === 'opportunity'), 'project note → opportunity');

  const wonSuggestion = evaluateStageSuggestionRules({
    pipeline_stage: 'opportunity',
    timing_status: 'active_project',
  });
  assert(wonSuggestion.some((s) => s.suggested_to_stage === 'active_builder'), 'won job → active_builder');

  const repeatSuggestion = evaluateStageSuggestionRules({
    pipeline_stage: 'active_builder',
    builder_status: 'active_partner',
    relationship_strength: 'worked_together',
    founder_notes: 'Second job on repeat work',
  });
  assert(repeatSuggestion.some((s) => s.suggested_to_stage === 'strategic_partner'), 'repeat → strategic_partner');
  console.log('rule evaluation OK');
}

function testUiAssets() {
  console.log('\n=== UI assets ===\n');
  const html = fs.readFileSync(HTML, 'utf8');
  const js = fs.readFileSync(JS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  assert(html.includes('bi-section-stage-suggestion'), 'stage suggestion section');
  assert(html.includes('bi-btn-approve-suggestion'), 'approve button');
  assert(html.includes('bi-btn-dismiss-suggestion'), 'dismiss button');
  assert(js.includes('renderStageSuggestionCard'), 'render suggestion card');
  assert(js.includes('approveStageSuggestion'), 'approve handler');
  assert(js.includes('dismissStageSuggestion'), 'dismiss handler');
  assert(js.includes('pending_stage_suggestion'), 'pipeline card suggestion');
  assert(css.includes('bi-stage-suggestion-card'), 'suggestion card CSS');
  console.log('UI assets OK');
}

async function testContactConfirmCreatesSuggestion() {
  console.log('\n=== Contact confirm → pending suggestion ===\n');
  const prospect = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Confirm Suggestion`,
    website: 'https://example-pr10c.test',
    research_status: 'researched',
    pipeline_stage: 'contact_discovery',
  });
  createdProspectIds.push(prospect.id);

  const discovery = await runContactDiscovery(prospect.id, {
    db: pool,
    fetchBuilderWebsite: async () => ({
      homepage_url: 'https://example-pr10c.test',
      pages: [
        {
          url: 'https://example-pr10c.test/team',
          html: '<p>Sam Lee - Director</p><a href="mailto:sam@example-pr10c.test">Email</a>',
        },
      ],
    }),
    fetch: async () => ({ ok: false }),
  });

  const confirmed = await confirmBuilderContact(prospect.id, discovery.recommended_contact.id, { db: pool });
  assert(confirmed.prospect.pipeline_stage === 'contact_discovery', 'stage unchanged after confirm');
  assert(confirmed.stage_suggestion?.status === 'pending', 'pending suggestion created');
  assert(confirmed.stage_suggestion?.suggested_to_stage === 'contact_ready', 'suggests contact_ready');
  assert(confirmed.stage_suggestion?.source === 'contact_discovery', 'contact_discovery source');
  console.log('contact confirm suggestion OK');
}

async function testApproveAndDismiss() {
  console.log('\n=== Approve / dismiss ===\n');
  const prospect = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Approve Builder`,
    pipeline_stage: 'contact_discovery',
    research_status: 'researched',
  });
  createdProspectIds.push(prospect.id);

  const suggestion = await createStageSuggestion(
    prospect.id,
    {
      suggested_to_stage: 'contact_ready',
      reason: 'Test suggestion',
      confidence_score: 80,
      source: 'manual',
    },
    { db: pool }
  );
  assert(suggestion.status === 'pending', 'created pending');

  const approved = await approveStageSuggestion(suggestion.id, { db: pool });
  assert(approved.prospect.pipeline_stage === 'contact_ready', 'approve moves stage');
  assert(approved.suggestion.status === 'approved', 'suggestion approved');

  const prospect2 = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Dismiss Builder`,
    pipeline_stage: 'relationship_building',
    research_status: 'researched',
    founder_notes: 'Project quote discussed',
  });
  createdProspectIds.push(prospect2.id);

  const refreshed = await refreshStageSuggestionsForProspect(prospect2.id, { db: pool });
  assert(refreshed?.suggested_to_stage === 'opportunity', 'refresh creates opportunity suggestion');

  const dismissed = await dismissStageSuggestion(refreshed.id, { db: pool });
  assert(dismissed.status === 'dismissed', 'dismissed');
  const pending = await getPendingStageSuggestion(prospect2.id, { db: pool });
  assert(!pending, 'no pending after dismiss');
  console.log('approve/dismiss OK');
}

async function testPipelineViewAttachments() {
  console.log('\n=== Pipeline view attachments ===\n');
  const readyProspect = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Pipeline Call Action`,
    pipeline_stage: 'contact_ready',
    research_status: 'researched',
    contact_name: 'Alex',
  });
  createdProspectIds.push(readyProspect.id);

  const view = await getBuilderPipelineView({ db: pool });
  const readyCard = view.builders.find((b) => b.id === readyProspect.id);
  assert(readyCard, 'builder in pipeline view');
  assert(readyCard.display_next_action === 'Call Builder', 'contact_ready with no call shows Call Builder');

  const discoveryProspect = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Pipeline Suggestion`,
    pipeline_stage: 'contact_discovery',
    research_status: 'researched',
  });
  createdProspectIds.push(discoveryProspect.id);

  await suggestContactReadyAfterConfirm(discoveryProspect.id, { name: 'Pat' }, { db: pool });
  const view2 = await getBuilderPipelineView({ db: pool });
  const suggestionCard = view2.builders.find((b) => b.id === discoveryProspect.id);
  assert(suggestionCard.pending_stage_suggestion?.title?.includes('Contact'), 'pipeline card has suggestion');
  console.log('pipeline view OK');
}

async function main() {
  try {
    await ensureMigrations();
    await cleanup();
    testRuleEvaluation();
    testUiAssets();
    assert(SUGGESTION_SOURCES.includes('contact_discovery'), 'sources defined');
    await testContactConfirmCreatesSuggestion();
    await testApproveAndDismiss();
    await testPipelineViewAttachments();
    console.log('\nAll PR10C stage suggestion tests passed.\n');
  } catch (err) {
    console.error('\nFAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await cleanup();
    await pool.end();
  }
}

main();
