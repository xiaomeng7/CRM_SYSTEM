#!/usr/bin/env node
/**
 * PR9B.4.2 — Discovery exhaustion & search guidance tests.
 */

const fs = require('fs');
const path = require('path');
const {
  parseRunContext,
  buildDiscoveryExhaustionGuidance,
  buildMarketCoverage,
} = require('../services/builder/discovery/discoverySearchGuidance');
const { buildDiscoveryRunSummary } = require('../services/builder/discovery/discoveryQualityScore');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'public/builder-intelligence.html');
const JS = path.join(ROOT, 'public/js/builder-intelligence.js');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testParseContext() {
  console.log('\n=== Parse run context ===\n');
  const ctx = parseRunContext({ query: 'luxury home builder adelaide', location: null });
  assert(ctx.isBroadAdelaide === true, 'broad adelaide');
  assert(ctx.categoryId === 'luxury', 'luxury category');

  const suburbCtx = parseRunContext({ query: 'architectural builder Burnside SA', location: 'Burnside SA' });
  assert(suburbCtx.suburb === 'Burnside', 'burnside');
  assert(suburbCtx.categoryId === 'architectural', 'architectural');
  console.log('parse OK');
}

function testExhaustionGuidance() {
  console.log('\n=== Exhaustion guidance ===\n');
  const summary = {
    total_results: 13,
    existing_builders_hidden: 13,
    seo_pages_hidden: 2,
    directories_hidden: 0,
    new_builders_remaining: 0,
  };
  const guidance = buildDiscoveryExhaustionGuidance(
    { query: 'luxury home builder adelaide', location: null },
    summary
  );
  assert(guidance.exhausted === true, 'exhausted');
  assert(guidance.market_coverage.total_found === 13, 'total');
  assert(guidance.market_coverage.new_builders === 0, 'new zero');
  assert(guidance.recommended_next_searches.length >= 2, 'categories');
  const nearby = guidance.recommended_next_searches.find((c) => c.id === 'nearby_premium_suburbs');
  assert(nearby && nearby.searches.length > 0, 'nearby searches');
  assert(nearby.searches[0].query.includes('Burnside'), 'suggests suburb');
  assert(
    !nearby.searches.some((s) => s.query === 'luxury home builder adelaide'),
    'excludes current query'
  );
  console.log('guidance OK, nearby:', nearby.searches.length);
}

function testNotExhaustedWhenNewRemain() {
  console.log('\n=== Not exhausted when new builders remain ===\n');
  const guidance = buildDiscoveryExhaustionGuidance(
    { query: 'custom home builder Norwood SA' },
    { total_results: 8, new_builders_remaining: 3 }
  );
  assert(guidance.exhausted === false, 'not exhausted');
  assert(guidance.recommended_next_searches.length === 0, 'no next searches');
  console.log('not exhausted OK');
}

function testUiStatic() {
  console.log('\n=== UI: PR9B.4.2 ===\n');
  const html = fs.readFileSync(HTML, 'utf8');
  const js = fs.readFileSync(JS, 'utf8');
  assert(html.includes('bi-disc-exhaustion'), 'exhaustion panel');
  assert(js.includes('renderDiscoveryExhaustion'), 'exhaustion renderer');
  assert(js.includes('Market Coverage Summary'), 'coverage title');
  assert(js.includes('bi-disc-run-guided'), 'run search buttons');
  console.log('UI OK');
}

function main() {
  console.log('PR9B.4.2 Discovery guidance tests\n');
  testParseContext();
  testExhaustionGuidance();
  testNotExhaustedWhenNewRemain();
  testUiStatic();
  console.log('\n✓ All PR9B.4.2 tests passed\n');
}

main();
