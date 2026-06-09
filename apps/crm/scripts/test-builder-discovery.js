#!/usr/bin/env node
/**
 * PR9A — Builder Discovery Engine v1 tests.
 * Usage: pnpm --filter @bht/crm run test:builder-discovery
 */

require('../lib/load-env');
const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');
const {
  createDiscoveryRun,
  getDiscoveryRunById,
  importDiscoveryCandidate,
  importSelectedCandidates,
  dismissDiscoveryCandidate,
} = require('../services/builder/discovery/builderDiscoveryService');
const { normalizeBuilderCandidate, calculateConfidenceScore } = require('../services/builder/discovery/normalizeBuilderCandidate');
const { runSearchEngineDiscovery } = require('../services/builder/discovery/searchEngineDiscovery');
const { createBuilderProspect, listBuilderProspects } = require('../services/builder/builderProspectService');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'public/builder-intelligence.html');
const JS = path.join(ROOT, 'public/js/builder-intelligence.js');
const CSS = path.join(ROOT, 'public/css/builder-intelligence.css');
const TEST_PREFIX = 'test_pr9a_';
const createdProspectIds = [];
const createdRunIds = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function ensureMigration() {
  const sql = fs.readFileSync(path.join(__dirname, '../database/075_builder_discovery.sql'), 'utf8');
  await pool.query(sql);
}

async function cleanup() {
  if (createdRunIds.length) {
    await pool.query(`DELETE FROM builder_discovery_runs WHERE id = ANY($1::uuid[])`, [createdRunIds]);
  }
  await pool.query(`DELETE FROM builder_discovery_runs WHERE query LIKE $1`, [`${TEST_PREFIX}%`]);
  if (createdProspectIds.length) {
    await pool.query(`DELETE FROM b2b_prospects WHERE id = ANY($1::uuid[])`, [createdProspectIds]);
  }
  await pool.query(`DELETE FROM b2b_prospects WHERE company_name LIKE $1`, [`${TEST_PREFIX}%`]);
}

function testUiStatic() {
  console.log('\n=== UI: discovery engine section ===\n');
  const html = fs.readFileSync(HTML, 'utf8');
  const js = fs.readFileSync(JS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  assert(html.includes('bi-discovery-engine'), 'discovery section');
  assert(html.includes('bi-disc-seed-json'), 'seed JSON textarea');
  assert(html.includes('bi-btn-disc-run'), 'run discovery button');
  assert(html.includes('bi-disc-candidates'), 'candidate table body');
  assert(js.includes('runDiscovery'), 'runDiscovery JS');
  assert(js.includes('/discovery/run'), 'discovery API call');
  assert(css.includes('.bi-discovery-table'), 'discovery table CSS');
  console.log('UI OK');
}

function testNormalization() {
  console.log('\n=== Candidate normalization + confidence ===\n');
  const normalized = normalizeBuilderCandidate(
    {
      company_name: ' Adelaide Custom Homes Builder ',
      website: 'example.com.au',
      phone: '08 1234 5678',
      location: 'Burnside, SA',
      source_url: 'https://directory.test/listing/1',
    },
    { query: 'custom home builder Adelaide', location: 'Burnside SA' }
  );
  assert(normalized.company_name === 'Adelaide Custom Homes Builder', 'company trimmed');
  assert(normalized.website.startsWith('https://'), 'website normalized');
  assert(normalized.suburb === 'Burnside', 'suburb extracted');
  assert(normalized.suggested_builder_type === 'custom_homes', 'type suggested');
  const score = calculateConfidenceScore(normalized);
  assert(score >= 50, `confidence score reasonable: ${score}`);
  console.log('normalization OK, score:', score);
}

async function testWebDiscoveryDisabled() {
  console.log('\n=== Web discovery disabled by default ===\n');
  const prev = process.env.BUILDER_DISCOVERY_WEB_ENABLED;
  delete process.env.BUILDER_DISCOVERY_WEB_ENABLED;
  const result = await runSearchEngineDiscovery({ query: 'builder Adelaide', location: 'SA' });
  assert(result.ok === false, 'not ok');
  assert(result.reason === 'web_discovery_disabled', result.reason);
  if (prev) process.env.BUILDER_DISCOVERY_WEB_ENABLED = prev;
  console.log('web disabled OK');
}

async function testCreateRunWithSeeds() {
  console.log('\n=== Create discovery run with seed candidates ===\n');

  const existing = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Existing Co`,
    website: 'https://existing-pr9a.test',
    source: 'manual',
  });
  createdProspectIds.push(existing.id);

  const { run, candidates } = await createDiscoveryRun({
    query: `${TEST_PREFIX} custom home builder Adelaide`,
    location: 'Adelaide SA',
    source: 'manual_seed',
    seed_candidates: [
      {
        company_name: `${TEST_PREFIX} New Custom Homes`,
        website: 'https://new-custom-pr9a.test',
        phone: '08 1111 2222',
        location: 'Adelaide SA',
      },
      {
        company_name: `${TEST_PREFIX} Existing Co`,
        website: 'https://existing-pr9a.test',
        location: 'Adelaide SA',
      },
      {
        company_name: `${TEST_PREFIX} No Website Co`,
        location: 'Adelaide SA',
      },
    ],
  });
  createdRunIds.push(run.id);

  assert(run.status === 'completed', 'run completed');
  assert(candidates.length === 3, 'three candidates stored');
  const fresh = candidates.find((c) => c.company_name.includes('New Custom'));
  const dup = candidates.find((c) => c.company_name.includes('Existing'));
  assert(fresh && fresh.status === 'candidate', 'new candidate');
  assert(dup && dup.status === 'duplicate', 'duplicate flagged');
  assert(dup.matched_prospect_id === existing.id, 'duplicate matched prospect');
  console.log('create run OK');
  return { run, candidates, fresh, dup };
}

async function testImportAndDuplicateGuard() {
  console.log('\n=== Import candidate + duplicate guard ===\n');
  const { fresh } = await testCreateRunWithSeeds();

  const imported = await importDiscoveryCandidate(fresh.id);
  createdProspectIds.push(imported.prospect.id);
  assert(imported.candidate.status === 'imported', 'candidate imported');
  assert(imported.prospect.source === 'discovery', 'prospect source discovery');
  assert(imported.prospect.research_status === 'not_started', 'no auto research');
  assert(imported.prospect.builder_status === 'prospect', 'prospect status');

  let duplicateBlocked = false;
  try {
    await importDiscoveryCandidate(fresh.id);
  } catch (err) {
    duplicateBlocked = err.code === 'ALREADY_IMPORTED';
  }
  assert(duplicateBlocked, 'second import blocked');

  const list = await listBuilderProspects({ search: TEST_PREFIX });
  const found = list.prospects.find((p) => p.id === imported.prospect.id);
  assert(found, 'imported builder in list');
  console.log('import OK');
}

async function testDismissCandidate() {
  console.log('\n=== Dismiss candidate ===\n');
  const { run, candidates } = await createDiscoveryRun({
    query: `${TEST_PREFIX} dismiss test`,
    location: 'Adelaide SA',
    source: 'manual_seed',
    seed_candidates: [
      {
        company_name: `${TEST_PREFIX} Dismiss Me Homes`,
        website: 'https://dismiss-pr9a.test',
        location: 'Adelaide SA',
      },
    ],
  });
  createdRunIds.push(run.id);
  const candidate = candidates[0];
  const dismissed = await dismissDiscoveryCandidate(candidate.id);
  assert(dismissed.status === 'dismissed', 'dismissed status');

  let dismissImportedFail = false;
  const { run: run2, candidates: c2 } = await createDiscoveryRun({
    query: `${TEST_PREFIX} dismiss imported test`,
    source: 'manual_seed',
    seed_candidates: [
      {
        company_name: `${TEST_PREFIX} Import Then Dismiss`,
        website: 'https://import-dismiss-pr9a.test',
      },
    ],
  });
  createdRunIds.push(run2.id);
  await importDiscoveryCandidate(c2[0].id);
  try {
    await dismissDiscoveryCandidate(c2[0].id);
  } catch (err) {
    dismissImportedFail = err.code === 'INVALID_INPUT';
  }
  assert(dismissImportedFail, 'cannot dismiss imported');
  console.log('dismiss OK');
}

async function testImportSelected() {
  console.log('\n=== Import selected batch ===\n');
  const { run, candidates } = await createDiscoveryRun({
    query: `${TEST_PREFIX} batch import`,
    source: 'manual_seed',
    seed_candidates: [
      { company_name: `${TEST_PREFIX} Batch A`, website: 'https://batch-a-pr9a.test' },
      { company_name: `${TEST_PREFIX} Batch B`, website: 'https://batch-b-pr9a.test' },
    ],
  });
  createdRunIds.push(run.id);
  const ids = candidates.filter((c) => c.status === 'candidate').map((c) => c.id);
  const result = await importSelectedCandidates(ids);
  assert(result.imported_count === 2, 'two imported');
  result.imported.forEach((row) => createdProspectIds.push(row.prospect_id));
  console.log('batch import OK');
}

async function main() {
  console.log('PR9A builder discovery tests\n');
  try {
    testUiStatic();
    testNormalization();
    await testWebDiscoveryDisabled();
    await ensureMigration();
    await cleanup();
    await testImportAndDuplicateGuard();
    await testDismissCandidate();
    await testImportSelected();
    console.log('\n✓ All PR9A builder discovery tests passed\n');
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
