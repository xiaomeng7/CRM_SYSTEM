#!/usr/bin/env node
/**
 * PR9B.2 live — Quick searches + verification queries.
 */

require('../lib/load-env');
const fs = require('fs');
const path = require('path');
const {
  generateQuickSearches,
  VERIFICATION_SEARCHES,
  QUICK_SEARCH_CATEGORIES,
  TARGET_SUBURBS,
} = require('../services/builder/discovery/discoveryStrategies');
const { SerpApiProvider } = require('../services/builder/discovery/providers/serpApiProvider');
const { isSerpApiConfigured } = require('../services/builder/discovery/providers/serpApiProvider');

const HTML = path.join(__dirname, '../public/builder-intelligence.html');
const JS = path.join(__dirname, '../public/js/builder-intelligence.js');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testQuickSearches() {
  console.log('\n=== Quick search categories ===\n');
  assert(QUICK_SEARCH_CATEGORIES.length === 3, '3 categories');
  assert(TARGET_SUBURBS.length === 9, '9 suburbs');
  const quick = generateQuickSearches();
  assert(quick.length === 27, '27 combinations, got ' + quick.length);
  assert(quick.some((s) => s.category_id === 'architectural' && s.suburb === 'Burnside'), 'arch burnside');
  assert(quick.some((s) => s.category_id === 'luxury' && s.query.includes('luxury home builder')), 'luxury');
  assert(
    quick.some((s) => s.category_id === 'custom' && s.query.includes('custom home builder Norwood')),
    'custom norwood'
  );
  console.log('quick searches OK');
}

function testVerificationQueries() {
  console.log('\n=== Verification query set ===\n');
  assert(VERIFICATION_SEARCHES.length === 3, '3 verification queries');
  const labels = VERIFICATION_SEARCHES.map((s) => s.query);
  assert(labels.includes('architectural builder Burnside SA'), 'arch burnside query');
  assert(labels.includes('luxury builder Adelaide SA'), 'luxury adelaide query');
  assert(labels.includes('custom home builder Norwood SA'), 'custom norwood query');
  console.log('verification queries OK');
}

function testUiQuickSearches() {
  console.log('\n=== UI quick search elements ===\n');
  const html = fs.readFileSync(HTML, 'utf8');
  const js = fs.readFileSync(JS, 'utf8');
  assert(html.includes('bi-disc-quick-searches'), 'quick searches section');
  assert(html.includes('Find Builders'), 'find builders button');
  assert(html.includes('Import Top 10'), 'import top 10');
  assert(html.includes('bi-disc-m-found'), 'builders found metric');
  assert(html.includes('Google rating'), 'rating column');
  assert(html.includes('Review count'), 'review column');
  assert(js.includes('loadQuickSearches'), 'load quick searches');
  assert(js.includes('findBuilders'), 'findBuilders fn');
  assert(js.includes('importTop10Candidates'), 'import top 10 fn');
  console.log('UI OK');
}

async function testLiveVerification() {
  if (!isSerpApiConfigured()) {
    console.log('\n=== Live verification skipped (SerpAPI not configured locally) ===\n');
    return;
  }
  if (process.env.BUILDER_DISCOVERY_LIVE_TEST !== '1') {
    console.log('\n=== Live verification skipped (set BUILDER_DISCOVERY_LIVE_TEST=1) ===\n');
    return;
  }

  console.log('\n=== Live SerpAPI verification queries ===\n');
  const provider = new SerpApiProvider('serpapi', {});

  for (const item of VERIFICATION_SEARCHES) {
    const result = await provider.discoverBuilders({
      query: item.query,
      location: item.location,
      limit: 10,
    });
    assert(result.ok === true, `${item.query} failed: ${result.reason}`);
    console.log(`  ${item.query}: ${result.candidates.length} candidates`);
  }
  console.log('live verification OK');
}

async function main() {
  console.log('PR9B.2 live quick search tests\n');
  testQuickSearches();
  testVerificationQueries();
  testUiQuickSearches();
  await testLiveVerification();
  console.log('\n✓ All quick search / live verification tests passed\n');
}

main().catch((err) => {
  console.error('\n✗', err.message);
  process.exit(1);
});
