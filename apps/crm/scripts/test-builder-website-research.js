#!/usr/bin/env node
/**
 * PR8D — Builder website research engine tests.
 *
 * Usage:
 *   pnpm --filter @bht/crm run test:builder-website-research
 */

require('../lib/load-env');
const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');
const { createBuilderProspect } = require('../services/builder/builderProspectService');
const { getBuilderProfile, listResearchRuns } = require('../services/builder/builderProfileService');
const { fetchBuilderWebsite, discoverInternalUrls } = require('../services/builder/research/fetchBuilderWebsite');
const { extractWebsiteText, stripHtml } = require('../services/builder/research/extractWebsiteText');
const {
  analyzeBuilderWebsite,
  detectSignals,
  computeFitScore,
  fitPriorityFromScore,
  fitBandFromScore,
} = require('../services/builder/research/analyzeBuilderWebsite');
const { generateFounderIntelligence } = require('../services/builder/research/generateFounderIntelligence');
const { runBuilderResearch } = require('../services/builder/runBuilderResearch');

const TEST_PREFIX = 'test_pr8d_';
const FIXTURES = path.join(__dirname, '../services/builder/research/fixtures');
const createdProspectIds = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function readFixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

async function ensureMigrations() {
  const files = [
    '../database/069_builder_prospect_foundation.sql',
    '../database/070_builder_research_profiles.sql',
    '../database/072_builder_research_intelligence_refinement.sql',
  ];
  for (const rel of files) {
    await pool.query(fs.readFileSync(path.join(__dirname, rel), 'utf8'));
  }
}

async function cleanup() {
  if (createdProspectIds.length) {
    await pool.query(`DELETE FROM b2b_prospects WHERE id = ANY($1::uuid[])`, [createdProspectIds]);
  }
  await pool.query(`DELETE FROM b2b_prospects WHERE company_name LIKE $1`, [`${TEST_PREFIX}%`]);
}

function mockFetchFromFixtures(fixtureMap) {
  return async function mockFetchPage(url) {
    for (const [pattern, file] of Object.entries(fixtureMap)) {
      if (url.includes(pattern) || url.endsWith(pattern)) {
        return readFixture(file);
      }
    }
    if (fixtureMap['/']) return readFixture(fixtureMap['/']);
    throw new Error(`Unexpected fetch URL: ${url}`);
  };
}

async function testExtractFixture() {
  console.log('\n=== Homepage fetch/extract fixture ===\n');

  const html = readFixture('luxury-builder-home.html');
  const text = stripHtml(html);
  assert(text.includes('Heritage Luxury Homes'), 'title extracted');
  assert(text.includes('architect'), 'architect keyword');

  const extracted = extractWebsiteText([
    { url: 'https://heritage-luxury.test/', html },
    { url: 'https://heritage-luxury.test/projects', html },
  ]);
  assert(extracted.snippets.length === 2, 'two snippets');
  assert(extracted.total_chars > 100, 'combined text length');

  const urls = discoverInternalUrls('https://heritage-luxury.test/', html);
  assert(urls.length >= 1, 'discover urls');
  console.log('extract OK, chars:', extracted.total_chars);
}

async function testDeterministicAnalysis() {
  console.log('\n=== Deterministic signal detection ===\n');

  const html = readFixture('luxury-builder-home.html');
  const extracted = extractWebsiteText([{ url: 'https://heritage-luxury.test/', html }]);
  const signals = detectSignals(extracted.combined_text, extracted.snippets);

  assert(signals.quality_signals.includes('mentions architect / architectural'), 'architect signal');
  assert(signals.quality_signals.includes('mentions custom homes'), 'custom homes');
  assert(signals.quality_signals.includes('mentions smart home / automation / lighting'), 'smart home');
  assert(signals.quality_signals.includes('has contact email / phone'), 'contact');

  const analysis = await analyzeBuilderWebsite({
    combined_text: extracted.combined_text,
    snippets: extracted.snippets,
    company_name: 'Heritage Luxury Homes',
    website_url: 'https://heritage-luxury.test',
    useLlm: false,
  });

  assert(analysis.estimated_fit_score >= 80, `luxury score 80+, got ${analysis.estimated_fit_score}`);
  assert(analysis.estimated_fit_score <= 95, `luxury score not inflated, got ${analysis.estimated_fit_score}`);
  assert(analysis.architectural_fit === 'high', 'architectural fit high');
  assert(analysis.smart_home_fit === 'high', 'smart home fit high');
  assert(analysis.research_source === 'website_fetch', 'no llm source');
  assert(analysis.target_suburbs.some((s) => /Unley/i.test(s)), 'suburb detected');
  assert(analysis.target_suburbs.some((s) => /Toorak Gardens/i.test(s)), 'service area suburb');
  assert(analysis.why_bht_fit.length >= 2, 'why_bht_fit bullets');
  assert(analysis.opportunity_summary.length >= 2, 'opportunity bullets');
  assert(analysis.recommended_founder_action, 'recommended action');
  assert(analysis.score_breakdown?.details?.length >= 3, 'score breakdown');
  assert(fitBandFromScore(analysis.estimated_fit_score) === 'A' || fitBandFromScore(analysis.estimated_fit_score) === 'B', 'band A or B');
  console.log('analysis score:', analysis.estimated_fit_score, 'band:', analysis.fit_band, 'focus:', analysis.builder_focus);
}

async function testCommercialResidentialOverride() {
  console.log('\n=== Commercial + residential risk override ===\n');

  const html = readFixture('mixed-commercial-residential.html');
  const extracted = extractWebsiteText([{ url: 'https://metrobuild.test/', html }]);
  const signals = detectSignals(extracted.combined_text, extracted.snippets);

  assert(!signals.risk_signals.includes('commercial-only focus'), 'no commercial-only when residential present');
  assert(signals.quality_signals.includes('mentions custom homes'), 'custom homes detected');

  const analysis = await analyzeBuilderWebsite({
    combined_text: extracted.combined_text,
    snippets: extracted.snippets,
    company_name: 'Metro Build Co',
    useLlm: false,
    relationship_stage: 'discovered',
    research_status: 'researched',
  });

  assert(!analysis.risk_signals.includes('commercial-only focus'), 'analysis excludes commercial-only risk');
  assert(analysis.target_suburbs.some((s) => /Burnside|Norwood/i.test(s)), 'suburbs from mixed builder');
  console.log('mixed builder score:', analysis.estimated_fit_score, 'risks:', analysis.risk_signals.join(', ') || 'none');
}

async function testFounderIntelligenceDeterministic() {
  console.log('\n=== Founder intelligence (deterministic) ===\n');

  const analysis = {
    estimated_fit_score: 88,
    builder_focus: 'architectural homes',
    architectural_fit: 'high',
    luxury_fit: 'high',
    smart_home_fit: 'medium',
    profile_summary: 'Test builder with strong architectural positioning.',
    detected: { architect_mention: true, custom_homes: true, luxury_premium: true },
  };

  const intel = generateFounderIntelligence(analysis, {
    company_name: 'Test Builder',
    relationship_stage: 'discovered',
    research_status: 'researched',
  });

  assert(intel.why_bht_fit.length <= 5, 'max 5 why bullets');
  assert(intel.opportunity_summary.length <= 5, 'max 5 opportunity bullets');
  assert(intel.recommended_founder_action === 'Call Builder', 'high score → call');
  assert(intel.founder_summary.includes('Band'), 'founder summary includes band');
  console.log('action:', intel.recommended_founder_action);
}

async function testScoringAndPriority() {
  console.log('\n=== Scoring + fit_priority ===\n');

  assert(fitPriorityFromScore(80) === 'high', '80 = high');
  assert(fitPriorityFromScore(60) === 'medium', '60 = medium');
  assert(fitPriorityFromScore(30) === 'low', '30 = low');

  const sparseHtml = readFixture('sparse-builder.html');
  const extracted = extractWebsiteText([{ url: 'https://sparse.test/', html: sparseHtml }]);
  const analysis = await analyzeBuilderWebsite({
    combined_text: extracted.combined_text,
    snippets: extracted.snippets,
    useLlm: false,
  });
  assert(analysis.estimated_fit_score < 50, 'sparse/low quality score');
  assert(analysis.risk_signals.length >= 2, 'risk signals detected');
  console.log('sparse score:', analysis.estimated_fit_score);
}

async function testFullResearchPipeline() {
  console.log('\n=== Profile update + completed run ===\n');

  const prospect = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Heritage Luxury`,
    website: 'https://heritage-luxury.test',
    research_status: 'not_started',
    fit_priority: 'unknown',
  });
  createdProspectIds.push(prospect.id);

  const prevKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  const result = await runBuilderResearch(prospect.id, {
    useLlm: false,
    fetchBuilderWebsite: async (url) => {
      const html = readFixture('luxury-builder-home.html');
      return {
        homepage_url: 'https://heritage-luxury.test/',
        pages: [
          { url: 'https://heritage-luxury.test/', html },
          { url: 'https://heritage-luxury.test/projects', html },
        ],
      };
    },
  });

  if (prevKey) process.env.OPENAI_API_KEY = prevKey;

  assert(result.ok, 'research ok');
  assert(result.profile.estimated_fit_score >= 80, 'profile score saved');
  assert(result.profile.founder_summary, 'founder summary saved');
  assert(result.profile.why_bht_fit.length >= 1, 'why_bht_fit saved');
  assert(result.profile.recommended_founder_action, 'recommended action saved');
  assert(result.profile.score_breakdown, 'score breakdown saved');
  assert(result.prospect.research_status === 'researched', 'research_status researched');
  assert(result.prospect.fit_priority === 'high', 'fit_priority high');
  assert(result.run.status === 'completed', 'run completed');
  assert(result.run.payload.fetched_urls.length === 2, 'fetched_urls in payload');

  const stageRow = await pool.query(
    `SELECT relationship_stage FROM b2b_prospects WHERE id = $1`,
    [prospect.id]
  );
  assert(stageRow.rows[0].relationship_stage === 'discovered', 'relationship_stage unchanged');

  const profile = await getBuilderProfile(prospect.id);
  assert(profile.profile_summary.length > 20, 'summary saved');
  assert(profile.quality_signals.length >= 3, 'quality signals saved');

  const runs = await listResearchRuns(prospect.id);
  assert(runs[0].status === 'completed', 'latest run completed');
  console.log('pipeline OK, score:', profile.estimated_fit_score);
}

async function testFailedResearchRun() {
  console.log('\n=== Failed run ===\n');

  const prospect = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Fail Builder`,
    website: 'https://fail.test',
  });
  createdProspectIds.push(prospect.id);

  let caught = null;
  try {
    await runBuilderResearch(prospect.id, {
      useLlm: false,
      fetchBuilderWebsite: async () => {
        const err = new Error('HTTP 404 for https://fail.test');
        err.code = 'FETCH_FAILED';
        throw err;
      },
    });
  } catch (err) {
    caught = err;
  }

  assert(caught, 'research threw');
  assert(caught.run.status === 'failed', 'failed run recorded');
  assert(caught.run.error_message.includes('404'), 'error message');

  const runs = await listResearchRuns(prospect.id);
  assert(runs[0].status === 'failed', 'failed in list');
  console.log('failed run OK');
}

async function testNoWebsite() {
  console.log('\n=== No website validation ===\n');

  const prospect = await createBuilderProspect({
    company_name: `${TEST_PREFIX} No Website`,
    website: null,
  });
  createdProspectIds.push(prospect.id);

  let caught = null;
  try {
    await runBuilderResearch(prospect.id);
  } catch (err) {
    caught = err;
  }
  assert(caught && caught.code === 'INVALID_INPUT', 'no website rejected');
  console.log('validation OK');
}

async function main() {
  console.log('PR8D builder website research tests\n');

  try {
    await ensureMigrations();
    await cleanup();

    await testExtractFixture();
    await testDeterministicAnalysis();
    await testCommercialResidentialOverride();
    await testFounderIntelligenceDeterministic();
    await testScoringAndPriority();
    await testFullResearchPipeline();
    await testFailedResearchRun();
    await testNoWebsite();

    console.log('\n✓ All PR8D tests passed\n');
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
