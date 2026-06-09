#!/usr/bin/env node
/**
 * PR8A — Builder Prospect Foundation tests.
 *
 * Usage:
 *   pnpm --filter @bht/crm run db:builder-prospect-migration
 *   pnpm --filter @bht/crm run test:builder-prospect-foundation
 */

require('../lib/load-env');
const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');
const {
  listBuilderProspects,
  getBuilderProspectById,
  createBuilderProspect,
  updateBuilderProspect,
  addBuilderProspectNote,
  PROSPECT_TYPE_BUILDER,
} = require('../services/builder/builderProspectService');
const { BUILDER_EVENT_TYPES } = require('../services/operations/eventService');
const { eventTypeBoost } = require('../services/operations/eventPriority');

const TEST_PREFIX = 'test_pr8a_';
const createdIds = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function ensureMigration() {
  const migrationPath = path.join(__dirname, '../database/069_builder_prospect_foundation.sql');
  assert(fs.existsSync(migrationPath), '069 migration file exists');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  await pool.query(sql);
  console.log('migration: 069_builder_prospect_foundation.sql OK (idempotent)');
}

async function cleanup() {
  if (!createdIds.length) return;
  await pool.query(`DELETE FROM b2b_prospects WHERE id = ANY($1::uuid[])`, [createdIds]);
  createdIds.length = 0;
}

async function testCreateBuilderProspect() {
  console.log('\n=== Create builder prospect ===\n');

  const p = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Luxury Homes SA`,
    suburb: 'Unley',
    website: 'https://example-builder.test',
    builder_type: 'luxury_residential',
    project_focus: 'architectural_new_build',
    fit_priority: 'high',
    research_status: 'not_started',
    relationship_stage: 'discovered',
    decision_maker_name: 'Jane Builder',
    decision_maker_role: 'Director',
    target_suburbs: 'Unley, Burnside, Glenelg',
    source_detail: 'Google Maps manual search',
  });
  createdIds.push(p.id);

  assert(p.prospect_type === PROSPECT_TYPE_BUILDER, 'prospect_type builder');
  assert(p.builder_type === 'luxury_residential', 'builder_type');
  assert(p.relationship_stage === 'discovered', 'relationship_stage default');
  assert(p.research_status === 'not_started', 'research_status');
  console.log('created:', p.id, p.company_name);
  return p;
}

async function testListOnlyBuilders(builderId) {
  console.log('\n=== List only prospect_type=builder ===\n');

  const rental = await pool.query(
    `INSERT INTO b2b_prospects (company_name, prospect_type, outreach_status)
     VALUES ($1, 'rental_agency', 'not_contacted') RETURNING id`,
    [`${TEST_PREFIX} Rental Co`]
  );
  createdIds.push(rental.rows[0].id);

  const list = await listBuilderProspects({ limit: 200 });
  assert(list.prospects.every((p) => p.prospect_type === 'builder'), 'all rows are builders');
  assert(list.prospects.some((p) => p.id === builderId), 'includes test builder');
  assert(!list.prospects.some((p) => p.id === rental.rows[0].id), 'excludes rental_agency');
  console.log('list count:', list.total, '(builders only)');
}

async function testUpdateBuilderFields(builderId) {
  console.log('\n=== Update builder fields ===\n');

  const updated = await updateBuilderProspect(builderId, {
    relationship_stage: 'qualified',
    research_status: 'researched',
    fit_priority: 'high',
    builder_type: 'custom_homes',
    next_followup_at: new Date('2026-06-15T09:00:00Z').toISOString(),
  });

  assert(updated.relationship_stage === 'qualified', 'relationship_stage updated');
  assert(updated.research_status === 'researched', 'research_status updated');
  assert(updated.builder_type === 'custom_homes', 'builder_type updated');
  console.log('updated stage:', updated.relationship_stage);
}

async function testFilterByStage(builderId) {
  console.log('\n=== Filter by relationship_stage ===\n');

  const qualified = await listBuilderProspects({ relationship_stage: 'qualified' });
  assert(qualified.prospects.some((p) => p.id === builderId), 'found in qualified filter');

  const discovered = await listBuilderProspects({ relationship_stage: 'discovered' });
  assert(!discovered.prospects.some((p) => p.id === builderId), 'not in discovered filter');
  console.log('filter qualified:', qualified.prospects.length, 'row(s)');
}

async function testFilterByPriority(builderId) {
  console.log('\n=== Filter by fit_priority ===\n');

  const high = await listBuilderProspects({ fit_priority: 'high' });
  assert(high.prospects.some((p) => p.id === builderId), 'found in high priority');

  const low = await listBuilderProspects({ fit_priority: 'low' });
  assert(!low.prospects.some((p) => p.id === builderId), 'not in low priority');
  console.log('filter high:', high.prospects.length, 'row(s)');
}

async function testDetailFields(builderId) {
  console.log('\n=== Detail returns expected fields ===\n');

  const detail = await getBuilderProspectById(builderId);
  assert(detail, 'detail found');
  const required = [
    'company_name',
    'website',
    'suburb',
    'builder_type',
    'project_focus',
    'fit_priority',
    'relationship_stage',
    'research_status',
    'next_followup_at',
    'last_contacted_at',
    'decision_maker_name',
    'target_suburbs',
    'qualification_notes',
    'source_detail',
    'outreach_log',
  ];
  for (const f of required) {
    assert(f in detail, `detail has ${f}`);
  }
  console.log('detail fields OK, outreach_log:', Array.isArray(detail.outreach_log));

  const withNote = await addBuilderProspectNote(builderId, 'Test note from PR8A');
  assert(withNote.notes && withNote.notes.includes('Test note from PR8A'), 'note appended');
  console.log('add note OK');
}

async function testNonBuilderUnaffected() {
  console.log('\n=== Non-builder b2b prospects unaffected ===\n');

  const r = await pool.query(
    `SELECT prospect_type, outreach_status FROM b2b_prospects
     WHERE company_name = $1`,
    [`${TEST_PREFIX} Rental Co`]
  );
  assert(r.rows[0].prospect_type === 'rental_agency', 'rental still rental_agency');
  assert(r.rows[0].outreach_status === 'not_contacted', 'outreach_status unchanged');
  console.log('rental_agency row intact');
}

async function testOperationalEventTypesReserved() {
  console.log('\n=== Operational event types reserved ===\n');

  const expected = [
    'builder_research_needed',
    'builder_followup',
    'builder_reply_received',
    'builder_meeting_needed',
  ];
  for (const t of expected) {
    assert(BUILDER_EVENT_TYPES.includes(t), `BUILDER_EVENT_TYPES includes ${t}`);
    assert(eventTypeBoost(t) > 0, `${t} has priority boost`);
  }
  console.log('builder event types:', BUILDER_EVENT_TYPES.join(', '));
}

async function main() {
  console.log('PR8A Builder Prospect Foundation tests\n');

  try {
    await ensureMigration();
    const builder = await testCreateBuilderProspect();
    await testListOnlyBuilders(builder.id);
    await testUpdateBuilderFields(builder.id);
    await testFilterByStage(builder.id);
    await testFilterByPriority(builder.id);
    await testDetailFields(builder.id);
    await testNonBuilderUnaffected();
    await testOperationalEventTypesReserved();

    console.log('\n✓ All PR8A tests passed\n');
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
