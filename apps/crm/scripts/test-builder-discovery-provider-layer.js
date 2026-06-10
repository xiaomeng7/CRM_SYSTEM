#!/usr/bin/env node
/**
 * PR9B.1 — Builder discovery provider layer tests.
 */

require('../lib/load-env');
const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');
const discoveryConfig = require('../config/builder-discovery');
const {
  getProvider,
  listProviders,
  normalizeProviderSource,
  PROVIDER_SOURCES,
} = require('../services/builder/discovery/providers/providerRegistry');
const { ManualSeedProvider } = require('../services/builder/discovery/providers/manualSeedProvider');
const { SerpApiProvider } = require('../services/builder/discovery/providers/serpApiProvider');
const { assertProviderResult } = require('../services/builder/discovery/providers/baseProvider');
const { runDiscovery } = require('../services/builder/discovery/runDiscovery');
const {
  generateQuickSearches,
  getDiscoveryStrategyMeta,
  TARGET_SUBURBS,
  QUICK_SEARCH_CATEGORIES,
} = require('../services/builder/discovery/discoveryStrategies');
const { createDiscoveryRun } = require('../services/builder/discovery/builderDiscoveryService');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'public/builder-intelligence.html');
const JS = path.join(ROOT, 'public/js/builder-intelligence.js');
const TEST_PREFIX = 'test_pr9b1_';
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
  await pool.query(`DELETE FROM b2b_prospects WHERE company_name LIKE $1`, [`${TEST_PREFIX}%`]);
}

function testConfig() {
  console.log('\n=== Config: provider flags ===\n');
  assert(discoveryConfig.providers.manual_seed.enabled === true, 'manual_seed enabled');
  assert(discoveryConfig.isSerpApiConfigured() === false || process.env.BUILDER_DISCOVERY_SERPAPI_ENABLED !== 'true', 'serpapi env gated');
  assert(discoveryConfig.providers.serpapi.api_key_env === 'SERPAPI_API_KEY', 'serpapi env name');
  console.log('config OK');
}

function testRegistry() {
  console.log('\n=== Provider registry ===\n');
  assert(PROVIDER_SOURCES.includes('manual_seed'), 'manual_seed registered');
  assert(PROVIDER_SOURCES.includes('serpapi'), 'serpapi registered');
  assert(normalizeProviderSource('web_disabled') === 'serpapi', 'web_disabled alias');
  assert(normalizeProviderSource('search_engine') === 'serpapi', 'search_engine alias');

  const providers = listProviders();
  assert(providers.length >= 4, 'providers listed');
  assert(getProvider('manual_seed').name === 'manual_seed', 'manual lookup');

  let threw = false;
  try {
    getProvider('unknown_provider_xyz');
  } catch (err) {
    threw = err.code === 'INVALID_INPUT';
  }
  assert(threw, 'missing provider throws');
  console.log('registry OK');
}

async function testProviderContract() {
  console.log('\n=== Provider contract ===\n');

  const manual = new ManualSeedProvider('manual_seed', { enabled: true });
  const manualResult = await manual.discoverBuilders({
    query: 'custom builder Adelaide',
    location: 'Burnside SA',
    seed_candidates: [
      {
        company_name: `${TEST_PREFIX} Contract Homes`,
        website: 'https://contract-pr9b1.test',
        phone: '08 9999 0000',
        location: 'Burnside SA',
      },
    ],
  });
  assertProviderResult(manualResult, 'manual_seed');
  assert(manualResult.ok === true, 'manual ok');
  assert(manualResult.candidates.length === 1, 'one raw candidate');
  assert(manualResult.candidates[0].company_name.includes('Contract Homes'), 'candidate schema');

  const serp = new SerpApiProvider('serpapi', { enabled: false });
  const serpResult = await serp.discoverBuilders({
    query: 'luxury builder Adelaide',
    location: 'Adelaide SA',
  });
  assertProviderResult(serpResult, 'serpapi');
  assert(serpResult.ok === false, 'serp disabled');
  assert(serpResult.reason === 'serpapi_not_configured', serpResult.reason);
  console.log('contract OK');
}

async function testRunDiscoveryPipeline() {
  console.log('\n=== runDiscovery pipeline ===\n');

  const manual = await runDiscovery({
    source: 'manual_seed',
    query: `${TEST_PREFIX} pipeline query`,
    location: 'Norwood SA',
    seed_candidates: [
      {
        company_name: `${TEST_PREFIX} Pipeline Builder`,
        website: 'https://pipeline-pr9b1.test',
        location: 'Norwood SA',
      },
    ],
  });
  assert(manual.ok === true, 'manual pipeline ok');
  assert(manual.provider === 'manual_seed', 'manual provider');
  assert(manual.candidates[0].confidence_score > 0, 'normalized with score');
  assert(manual.candidates[0].suggested_builder_type, 'type suggested');

  const serp = await runDiscovery({
    source: 'serpapi',
    query: `${TEST_PREFIX} serp query`,
    location: 'Adelaide SA',
  });
  assert(serp.ok === false, 'serp pipeline disabled');
  assert(serp.reason === 'serpapi_not_configured', serp.reason);
  console.log('pipeline OK');
}

function testStrategies() {
  console.log('\n=== Discovery strategies ===\n');
  const meta = getDiscoveryStrategyMeta();
  assert(meta.target_suburbs.length === TARGET_SUBURBS.length, 'suburbs');
  assert(meta.quick_search_categories.length === QUICK_SEARCH_CATEGORIES.length, 'categories');
  assert(meta.quick_search_count === 27, '27 quick searches');

  const quick = generateQuickSearches();
  assert(quick.some((s) => s.query === 'architectural builder Burnside SA'), 'arch burnside');
  console.log('strategies OK, quick count:', quick.length);
}

function testDashboardUi() {
  console.log('\n=== UI: dashboard + quick searches ===\n');
  const html = fs.readFileSync(HTML, 'utf8');
  const js = fs.readFileSync(JS, 'utf8');
  assert(html.includes('bi-disc-dashboard'), 'dashboard section');
  assert(html.includes('bi-disc-quick-searches'), 'quick searches');
  assert(html.includes('Find Builders'), 'find builders button');
  assert(html.includes('Import Top 10'), 'import top 10');
  assert(js.includes('loadDiscoveryDashboard'), 'dashboard loader');
  assert(js.includes('loadQuickSearches'), 'quick searches loader');
  assert(js.includes('findBuilders'), 'find builders');
  console.log('UI OK');
}

async function testCreateDiscoveryRunCompat() {
  console.log('\n=== createDiscoveryRun compatibility ===\n');
  await ensureMigration();

  const { run, candidates, provider } = await createDiscoveryRun({
    query: `${TEST_PREFIX} compat run`,
    location: 'Unley Park SA',
    source: 'manual_seed',
    seed_candidates: [
      {
        company_name: `${TEST_PREFIX} Compat Builder`,
        website: 'https://compat-pr9b1.test',
        location: 'Unley Park SA',
      },
    ],
  });
  createdRunIds.push(run.id);
  assert(run.status === 'completed', 'run completed');
  assert(provider === 'manual_seed', 'provider recorded');
  assert(candidates.length === 1, 'candidate stored');
  assert(candidates[0].confidence_score > 0, 'normalized stored');

  const disabled = await createDiscoveryRun({
    query: `${TEST_PREFIX} serp disabled`,
    location: 'Adelaide SA',
    source: 'serpapi',
  });
  createdRunIds.push(disabled.run.id);
  assert(disabled.provider_disabled === true, 'provider disabled flag');
  assert(disabled.reason === 'serpapi_not_configured', disabled.reason);
  assert((disabled.candidates || []).length === 0, 'no candidates from disabled provider');
  console.log('compat OK');
}

async function main() {
  console.log('PR9B.1 builder discovery provider layer tests\n');
  try {
    testConfig();
    testRegistry();
    await testProviderContract();
    await testRunDiscoveryPipeline();
    testStrategies();
    testDashboardUi();
    await cleanup();
    await testCreateDiscoveryRunCompat();
    console.log('\n✓ All PR9B.1 provider layer tests passed\n');
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
