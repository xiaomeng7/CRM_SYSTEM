#!/usr/bin/env node
/**
 * PR9B.2 — SerpAPI provider integration tests (fixture-based, no live API by default).
 */

require('../lib/load-env');
const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');
const {
  parseSerpApiResponse,
  cleanCompanyName,
  shouldFilterResult,
  normalizeLocalResults,
} = require('../services/builder/discovery/providers/serpApiMapping');
const {
  SerpApiProvider,
  isSerpApiConfigured,
} = require('../services/builder/discovery/providers/serpApiProvider');
const { runDiscovery } = require('../services/builder/discovery/runDiscovery');
const { registry } = require('../services/builder/discovery/providers/providerRegistry');
const { createDiscoveryRun } = require('../services/builder/discovery/builderDiscoveryService');

const FIXTURE = path.join(
  __dirname,
  '../services/builder/discovery/fixtures/serpapi-builder-search.json'
);
const TEST_PREFIX = 'test_pr9b2_';
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

function withSerpEnv(fn) {
  const prevEnabled = process.env.BUILDER_DISCOVERY_SERPAPI_ENABLED;
  const prevKey = process.env.SERPAPI_API_KEY;
  process.env.BUILDER_DISCOVERY_SERPAPI_ENABLED = 'true';
  process.env.SERPAPI_API_KEY = 'test-serpapi-key';
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prevEnabled === undefined) delete process.env.BUILDER_DISCOVERY_SERPAPI_ENABLED;
      else process.env.BUILDER_DISCOVERY_SERPAPI_ENABLED = prevEnabled;
      if (prevKey === undefined) delete process.env.SERPAPI_API_KEY;
      else process.env.SERPAPI_API_KEY = prevKey;
    });
}

function withoutSerpEnv(fn) {
  const prevEnabled = process.env.BUILDER_DISCOVERY_SERPAPI_ENABLED;
  const prevKey = process.env.SERPAPI_API_KEY;
  delete process.env.BUILDER_DISCOVERY_SERPAPI_ENABLED;
  delete process.env.SERPAPI_API_KEY;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prevEnabled === undefined) delete process.env.BUILDER_DISCOVERY_SERPAPI_ENABLED;
      else process.env.BUILDER_DISCOVERY_SERPAPI_ENABLED = prevEnabled;
      if (prevKey === undefined) delete process.env.SERPAPI_API_KEY;
      else process.env.SERPAPI_API_KEY = prevKey;
    });
}

async function testDisabledSafeReason() {
  console.log('\n=== Disabled provider safe reason ===\n');
  await withoutSerpEnv(async () => {
    assert(isSerpApiConfigured() === false, 'not configured');
    const provider = new SerpApiProvider('serpapi', {});
    const result = await provider.discoverBuilders({
      query: 'architectural builder Burnside SA',
      location: 'Burnside SA',
    });
    assert(result.ok === false, 'not ok');
    assert(result.reason === 'serpapi_not_configured', result.reason);

    const pipeline = await runDiscovery({
      source: 'serpapi',
      query: `${TEST_PREFIX} disabled`,
      location: 'Adelaide SA',
    });
    assert(pipeline.ok === false, 'pipeline not ok');
    assert(pipeline.reason === 'serpapi_not_configured', pipeline.reason);
  });
  console.log('disabled OK');
}

function testFixtureMapping() {
  console.log('\n=== Fixture organic + local mapping ===\n');
  const body = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const candidates = parseSerpApiResponse(body, {
    query: 'architectural builder Burnside SA',
    location: 'Burnside SA',
  });

  const names = candidates.map((c) => c.company_name);
  assert(names.includes('Burnside Architectural Builders'), 'organic kept');
  assert(names.includes('Luxury Homes SA'), 'suffix cleaned');
  assert(names.includes('Norwood Custom Homes SA'), 'local kept');
  assert(names.some((n) => n.includes('No Website')), 'local without website kept');

  assert(!names.some((n) => /facebook/i.test(n)), 'facebook filtered');
  assert(!names.some((n) => /hipages/i.test(n)), 'hipages filtered');
  assert(!names.some((n) => /yellow pages/i.test(n)), 'yellowpages filtered');

  const local = candidates.find((c) => c.company_name === 'Norwood Custom Homes SA');
  assert(local.raw.google_rating === 4.8, 'rating stored');
  assert(local.raw.google_reviews === 42, 'reviews stored');
  assert(local.raw.raw_source === 'serpapi', 'raw_source');
  console.log('fixture mapping OK, count:', candidates.length);
}

function testCompanyCleanup() {
  console.log('\n=== Company name cleanup ===\n');
  assert(
    cleanCompanyName('Luxury Homes SA - Home') === 'Luxury Homes SA',
    'home suffix'
  );
  assert(
    cleanCompanyName('Acme | Custom Home Builder') === 'Acme',
    'pipe suffix'
  );
  console.log('cleanup OK');
}

function testFilterDeterministic() {
  console.log('\n=== Directory/social filter ===\n');
  assert(shouldFilterResult('Builders', 'https://instagram.com/x'), 'instagram');
  assert(shouldFilterResult('List', 'https://hipages.com.au/x'), 'hipages');
  assert(!shouldFilterResult('Custom Homes', 'https://builder.test'), 'builder ok');
  console.log('filter OK');
}

function testLocalResultsObjectShape() {
  console.log('\n=== local_results object shape (SerpAPI places) ===\n');
  const body = {
    organic_results: [],
    local_results: {
      places: [
        {
          title: 'Burnside Builder Co',
          website: 'https://burnside-builder.test',
          phone: '08 8111 2222',
          address: 'Burnside SA 5066, Australia',
          rating: 4.6,
          reviews: 18,
        },
      ],
    },
  };
  const candidates = parseSerpApiResponse(body, { query: 'builder Burnside SA' });
  assert(candidates.length === 1, 'places array parsed');
  assert(candidates[0].company_name === 'Burnside Builder Co', 'company name');
  assert(normalizeLocalResults(null).length === 0, 'null safe');
  assert(normalizeLocalResults({}).length === 0, 'empty object safe');
  console.log('local_results object OK');
}

async function testMockProviderFetch() {
  console.log('\n=== Mock SerpAPI fetch ===\n');
  await withSerpEnv(async () => {
    const body = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    const provider = new SerpApiProvider(
      'serpapi',
      {},
      {
        fetch: async () => ({
          ok: true,
          json: async () => body,
        }),
      }
    );
    const result = await provider.discoverBuilders({
      query: 'architectural builder Burnside SA',
      location: 'Burnside SA',
      limit: 20,
    });
    assert(result.ok === true, 'mock ok');
    assert(result.candidates.length >= 3, 'candidates returned');
  });
  console.log('mock fetch OK');
}

async function testPipelineStoresCandidates() {
  console.log('\n=== Pipeline stores SerpAPI candidates ===\n');
  await withSerpEnv(async () => {
    const body = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    const original = registry.serpapi;
    registry.serpapi = new SerpApiProvider(
      'serpapi',
      {},
      {
        fetch: async () => ({
          ok: true,
          json: async () => body,
        }),
      }
    );

    try {
      const { run, candidates } = await createDiscoveryRun({
        query: `${TEST_PREFIX} serpapi pipeline`,
        location: 'Burnside SA',
        source: 'serpapi',
      });
      createdRunIds.push(run.id);
      assert(run.status === 'completed', 'run completed');
      assert(run.source === 'serpapi', 'source serpapi');
      assert(candidates.length >= 3, 'stored candidates');

      const rated = candidates.find((c) => {
        const p = typeof c.payload === 'string' ? JSON.parse(c.payload) : c.payload;
        return p && p.google_rating != null;
      });
      assert(rated, 'rating in stored payload');
    } finally {
      registry.serpapi = original;
    }
  });
  console.log('pipeline store OK');
}

async function testLiveOptional() {
  if (!process.env.SERPAPI_API_KEY || process.env.BUILDER_DISCOVERY_LIVE_TEST !== '1') {
    console.log('\n=== Live SerpAPI test skipped (set BUILDER_DISCOVERY_LIVE_TEST=1) ===\n');
    return;
  }
  console.log('\n=== Live SerpAPI test ===\n');
  process.env.BUILDER_DISCOVERY_SERPAPI_ENABLED = 'true';
  const provider = new SerpApiProvider('serpapi', {});
  const result = await provider.discoverBuilders({
    query: 'architectural builder Burnside SA',
    location: 'Burnside SA',
    limit: 5,
  });
  assert(result.ok === true, 'live ok');
  console.log('live candidates:', result.candidates.length);
}

async function main() {
  console.log('PR9B.2 SerpAPI discovery tests\n');
  try {
    testFixtureMapping();
    testCompanyCleanup();
    testFilterDeterministic();
    testLocalResultsObjectShape();
    await testDisabledSafeReason();
    await testMockProviderFetch();
    await ensureMigration();
    await cleanup();
    await testPipelineStoresCandidates();
    await testLiveOptional();
    console.log('\n✓ All PR9B.2 SerpAPI tests passed\n');
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
