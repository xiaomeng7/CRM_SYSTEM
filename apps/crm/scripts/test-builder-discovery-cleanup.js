#!/usr/bin/env node
/**
 * PR9B.4A — Discovery result quality cleanup tests.
 */

require('../lib/load-env');
const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');
const {
  classifyDiscoveryCandidate,
  buildDiscoveryRunSummary,
  isNewVisibleBuilder,
} = require('../services/builder/discovery/discoveryQualityScore');
const { normalizeBuilderCandidate } = require('../services/builder/discovery/normalizeBuilderCandidate');
const {
  createDiscoveryRun,
  getDiscoveryRunById,
} = require('../services/builder/discovery/builderDiscoveryService');
const { createBuilderProspect } = require('../services/builder/builderProspectService');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'public/builder-intelligence.html');
const JS = path.join(ROOT, 'public/js/builder-intelligence.js');
const TEST_PREFIX = 'test_pr9b4a_';
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
    await pool.query(fs.readFileSync(path.join(__dirname, '../database', file), 'utf8'));
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

function testHardFilters() {
  console.log('\n=== Hard filters: directory / SEO URL / SEO title ===\n');
  const directory = classifyDiscoveryCandidate(
    normalizeBuilderCandidate(
      {
        company_name: 'List on hipages',
        website: 'https://hipages.com.au/builders/adelaide',
      },
      {}
    )
  );
  assert(directory.candidate_type === 'directory', 'directory type');
  assert(directory.hidden === true, 'directory hidden');
  assert(directory.quality_score === 0, 'directory score 0');

  const seoUrl = classifyDiscoveryCandidate(
    normalizeBuilderCandidate(
      {
        company_name: 'Luxury Trends',
        website: 'https://builder.test/blog/best-homes',
      },
      {}
    )
  );
  assert(seoUrl.hide_reason === 'seo_url', 'seo url');
  assert(seoUrl.hidden === true, 'seo url hidden');

  const seoTitle = classifyDiscoveryCandidate(
    normalizeBuilderCandidate(
      {
        company_name: 'Custom Home Builder Adelaide',
        website: 'https://real-builder.test',
      },
      {}
    )
  );
  assert(seoTitle.hide_reason === 'seo_title', 'seo title');
  assert(seoTitle.hidden === true, 'seo title hidden');
  console.log('hard filters OK');
}

function testSummaryCounts() {
  console.log('\n=== Cleanup summary counts ===\n');
  const rows = [
    {
      company_name: 'New Builder',
      website: 'https://new.test',
      status: 'candidate',
      confidence_score: 80,
      candidate_type: 'builder',
      hidden: false,
      quality_score: 80,
      quality_band: 'B',
    },
    {
      company_name: 'Oneflare',
      website: 'https://oneflare.com.au/x',
      status: 'candidate',
      confidence_score: 50,
      candidate_type: 'directory',
      hidden: true,
      hide_reason: 'directory',
      quality_score: 0,
      quality_band: 'D',
    },
    {
      company_name: 'Award Winning Builders',
      website: 'https://x.test',
      status: 'candidate',
      hidden: true,
      hide_reason: 'seo_title',
      quality_score: 0,
      quality_band: 'D',
    },
    {
      company_name: 'Existing Co',
      website: 'https://existing.test',
      status: 'duplicate',
      hidden: true,
      hide_reason: 'existing_crm',
      quality_score: 70,
      quality_band: 'B',
    },
  ];
  const summary = buildDiscoveryRunSummary(rows, { total_found: 4 });
  assert(summary.total_results === 4, 'total');
  assert(summary.existing_builders_hidden === 1, 'existing hidden');
  assert(summary.directories_hidden === 1, 'directories');
  assert(summary.seo_pages_hidden === 1, 'seo');
  assert(summary.new_builders_remaining === 1, 'new remaining');
  assert(isNewVisibleBuilder(rows[0]), 'new builder visible');
  console.log('summary OK');
}

function testUiStatic() {
  console.log('\n=== UI: PR9B.4A ===\n');
  const html = fs.readFileSync(HTML, 'utf8');
  const js = fs.readFileSync(JS, 'utf8');
  assert(html.includes('bi-disc-hide-existing'), 'hide existing checkbox');
  assert(js.includes('hideExistingBuilders'), 'hide existing JS');
  assert(js.includes('New Builders Remaining'), 'summary label');
  console.log('UI OK');
}

async function testExistingBuilderHidden() {
  console.log('\n=== Existing CRM builder hidden ===\n');
  const prospect = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Already In CRM`,
    website: 'https://already-in-crm-pr9b4a.test',
    source: 'manual',
  });
  createdProspectIds.push(prospect.id);

  const { run, candidates, summary } = await createDiscoveryRun({
    query: `${TEST_PREFIX} existing hide`,
    source: 'manual_seed',
    seed_candidates: [
      {
        company_name: `${TEST_PREFIX} Already In CRM`,
        website: 'https://already-in-crm-pr9b4a.test',
      },
      {
        company_name: `${TEST_PREFIX} Brand New Builder`,
        website: 'https://brand-new-pr9b4a.test',
        phone: '08 8111 2222',
        location: 'Adelaide SA',
      },
    ],
  });
  createdRunIds.push(run.id);

  const dup = candidates.find((c) => c.company_name.includes('Already In CRM'));
  const fresh = candidates.find((c) => c.company_name.includes('Brand New'));
  assert(dup && (dup.status === 'duplicate' || dup.hide_reason === 'existing_crm'), 'duplicate');
  assert(dup.hidden === true, 'existing hidden');
  assert(fresh && fresh.hidden === false, 'new builder not hidden');
  assert(summary.existing_builders_hidden >= 1, 'summary existing');
  assert(summary.new_builders_remaining >= 1, 'summary new');
  console.log('existing hide OK');
}

async function main() {
  console.log('PR9B.4A Discovery cleanup tests\n');
  try {
    testHardFilters();
    testSummaryCounts();
    testUiStatic();
    await ensureMigrations();
    await cleanup();
    await testExistingBuilderHidden();
    console.log('\n✓ All PR9B.4A tests passed\n');
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
