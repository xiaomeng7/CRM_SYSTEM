#!/usr/bin/env node
/**
 * PR9B.3 — Discovery quality filter + batch research tests.
 */

require('../lib/load-env');
const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');
const {
  calculateDiscoveryQualityScore,
  assignDiscoveryQualityBand,
  classifyDiscoveryCandidate,
  applyDiscoveryQuality,
  buildDiscoveryRunSummary,
} = require('../services/builder/discovery/discoveryQualityScore');
const {
  createDiscoveryRun,
  getDiscoveryRunById,
} = require('../services/builder/discovery/builderDiscoveryService');
const { researchDiscoveryCandidates } = require('../services/builder/discovery/batchDiscoveryResearch');
const { normalizeBuilderCandidate } = require('../services/builder/discovery/normalizeBuilderCandidate');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'public/builder-intelligence.html');
const JS = path.join(ROOT, 'public/js/builder-intelligence.js');
const TEST_PREFIX = 'test_pr9b3_';
const createdRunIds = [];
const createdProspectIds = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function ensureMigrations() {
  for (const file of [
    '075_builder_discovery.sql',
    '076_builder_discovery_quality.sql',
    '077_builder_discovery_cleanup.sql',
  ]) {
    const sql = fs.readFileSync(path.join(__dirname, '../database', file), 'utf8');
    await pool.query(sql);
  }
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

function testQualityPenalties() {
  console.log('\n=== Quality score penalties ===\n');
  const clean = normalizeBuilderCandidate(
    {
      company_name: `${TEST_PREFIX} Scott Salisbury Homes`,
      website: 'https://scottsalisburyhomes.com.au',
      phone: '08 1111 2222',
      location: 'Adelaide SA',
    },
    { query: 'luxury builder Adelaide SA' }
  );
  const cleanScore = calculateDiscoveryQualityScore(clean);
  assert(cleanScore === clean.confidence_score, 'clean builder keeps confidence');

  const directory = normalizeBuilderCandidate(
    {
      company_name: `${TEST_PREFIX} Award Winning Builders`,
      website: 'https://www.oneflare.com.au/builders/sa/norwood',
      location: 'Norwood SA',
    },
    { query: 'builder Norwood SA' }
  );
  const classifiedDir = classifyDiscoveryCandidate(directory);
  assert(classifiedDir.hidden === true, 'directory hidden');
  assert(classifiedDir.candidate_type === 'directory', 'directory type');

  const blogPath = normalizeBuilderCandidate(
    {
      company_name: `${TEST_PREFIX} Insights Co`,
      website: 'https://example.test/insights/luxury-homes',
      location: 'Adelaide SA',
    },
    { query: 'luxury builder' }
  );
  const classifiedBlog = classifyDiscoveryCandidate(blogPath);
  assert(classifiedBlog.hide_reason === 'seo_url', 'seo url hard hide');

  console.log('penalties OK', { cleanScore, dirScore: classifiedDir.quality_score });
}

function testQualityBands() {
  console.log('\n=== Quality bands ===\n');
  assert(assignDiscoveryQualityBand(90) === 'A', 'A band');
  assert(assignDiscoveryQualityBand(75) === 'B', 'B band');
  assert(assignDiscoveryQualityBand(55) === 'C', 'C band');
  assert(assignDiscoveryQualityBand(20) === 'D', 'D band');
  console.log('bands OK');
}

function testSummaryBuilder() {
  console.log('\n=== Discovery summary ===\n');
  const summary = buildDiscoveryRunSummary(
    [
      {
        ...applyDiscoveryQuality(
          normalizeBuilderCandidate(
            { company_name: 'Scott Salisbury Homes', website: 'https://scottsalisbury.test' },
            {}
          )
        ),
        status: 'candidate',
      },
      {
        ...applyDiscoveryQuality(
          normalizeBuilderCandidate(
            {
              company_name: 'Award Winning Builders',
              website: 'https://oneflare.com.au/x',
            },
            {}
          )
        ),
        status: 'candidate',
      },
    ],
    { total_found: 2 }
  );
  assert(summary.builders_found === 2, 'builders found');
  assert(summary.top_recommended.length >= 1, 'top recommended');
  assert(summary.recommended_founder_action === 'Research Top 10 Builders', summary.recommended_founder_action);
  console.log('summary OK');
}

function testUiStatic() {
  console.log('\n=== UI: PR9B.3 elements ===\n');
  const html = fs.readFileSync(HTML, 'utf8');
  const js = fs.readFileSync(JS, 'utf8');
  assert(html.includes('bi-disc-summary'), 'summary block');
  assert(html.includes('bi-disc-hide-low'), 'hide low checkbox');
  assert(html.includes('bi-btn-disc-research-top10'), 'research top 10');
  assert(html.includes('Quality Score'), 'quality score column');
  assert(js.includes('renderDiscoverySummary'), 'summary renderer');
  assert(js.includes('research-top-10'), 'research top 10 API');
  assert(js.includes('research-selected'), 'research selected API');
  console.log('UI OK');
}

async function testStoredQualityOnRun() {
  console.log('\n=== Stored quality on discovery run ===\n');
  const { run, candidates } = await createDiscoveryRun({
    query: `${TEST_PREFIX} quality run`,
    source: 'manual_seed',
    seed_candidates: [
      {
        company_name: `${TEST_PREFIX} Good Builder`,
        website: 'https://good-builder-pr9b3.test',
        phone: '08 8000 0001',
        location: 'Burnside SA',
      },
      {
        company_name: `${TEST_PREFIX} Award Winning Builders`,
        website: 'https://www.buildpilot.com.au/building-in/norwood',
        location: 'Norwood SA',
      },
    ],
  });
  createdRunIds.push(run.id);

  const good = candidates.find((c) => c.company_name.includes('Good Builder'));
  const bad = candidates.find((c) => c.company_name.includes('Award Winning'));
  assert(good && good.quality_score >= 50, 'good builder quality');
  assert(bad && bad.hidden === true, 'spam candidate hidden');
  assert(
    bad.hide_reason === 'seo_title' || bad.hide_reason === 'directory',
    'spam hide reason'
  );
  assert(good.quality_band === 'A' || good.quality_band === 'B' || good.quality_band === 'C', 'good band');

  const loaded = await getDiscoveryRunById(run.id);
  assert(loaded.summary.high_quality + loaded.summary.medium_quality + loaded.summary.low_quality >= 2, 'summary counts');
  console.log('stored quality OK');
}

async function testBatchResearchMock() {
  console.log('\n=== Batch research (mocked) ===\n');
  const { run, candidates } = await createDiscoveryRun({
    query: `${TEST_PREFIX} batch research`,
    source: 'manual_seed',
    seed_candidates: [
      {
        company_name: `${TEST_PREFIX} Batch Target`,
        website: 'https://batch-target-pr9b3.test',
        phone: '08 8000 0002',
        location: 'Adelaide SA',
      },
    ],
  });
  createdRunIds.push(run.id);
  const candidate = candidates[0];
  assert(candidate.status === 'candidate', 'candidate ready');

  const batch = await researchDiscoveryCandidates([candidate.id], {
    researchRunner: async (prospectId) => {
      createdProspectIds.push(prospectId);
      return {
        ok: true,
        analysis: { estimated_fit_score: 82, fit_band: 'B' },
      };
    },
  });

  assert(batch.researched_count === 1, 'one researched');
  const reloaded = await getDiscoveryRunById(run.id);
  const updated = reloaded.candidates.find((c) => c.id === candidate.id);
  assert(updated.status === 'imported', 'imported after batch');
  assert(updated.matched_prospect_id, 'prospect linked');
  console.log('batch research OK');
}

async function main() {
  console.log('PR9B.3 Discovery quality + batch research tests\n');
  try {
    testQualityPenalties();
    testQualityBands();
    testSummaryBuilder();
    testUiStatic();
    await ensureMigrations();
    await cleanup();
    await testStoredQualityOnRun();
    await testBatchResearchMock();
    console.log('\n✓ All PR9B.3 tests passed\n');
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
