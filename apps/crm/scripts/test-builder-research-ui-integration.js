#!/usr/bin/env node
/**
 * Builder Intelligence UI integration tests (static file checks).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'public/builder-intelligence.html');
const JS = path.join(ROOT, 'public/js/builder-intelligence.js');
const CSS = path.join(ROOT, 'public/css/builder-intelligence.css');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function read(file) {
  assert(fs.existsSync(file), 'Missing file: ' + file);
  return fs.readFileSync(file, 'utf8');
}

function testHtmlDiscovery(html) {
  console.log('\n=== HTML: discovery-first layout ===\n');
  assert(html.includes('bi-add-dialog'), 'add builder dialog');
  assert(html.includes('bi-add-form'), 'add builder form');
  assert(html.includes('bi-builder-cards'), 'builder cards grid');
  assert(html.includes('Contact Discovery'), 'contact discovery section');
  assert(html.includes('Research Results'), 'research results section');
  assert(html.includes('Contact This Week'), 'contact this week');
  assert(html.includes('Strategic Partners'), 'strategic partners');
  assert(html.includes('bi-builder_status'), 'builder status');
  assert(html.includes('bi-relationship_strength'), 'relationship strength');
  console.log('  OK: discovery HTML');
}

function testJsDiscovery(js) {
  console.log('\n=== JS: discovery workflow ===\n');
  assert(js.includes('saveAddAndResearch'), 'save and research');
  assert(js.includes('auto_research: true'), 'auto research flag');
  assert(js.includes('renderBuilderCards'), 'builder cards');
  assert(js.includes('/research/run'), 'research endpoint');
  assert(js.includes('x-admin-secret'), 'admin secret');
  console.log('  OK: discovery JS');
}

function testCssCards(css) {
  console.log('\n=== CSS: builder cards ===\n');
  assert(css.includes('.bi-builder-card'), 'builder card styles');
  assert(css.includes('.bi-summary-card'), 'summary card styles');
  console.log('  OK: card CSS');
}

function main() {
  const html = read(HTML);
  const js = read(JS);
  const css = read(CSS);
  testHtmlDiscovery(html);
  testJsDiscovery(js);
  testCssCards(css);
  console.log('\nAll Builder Intelligence UI checks passed.\n');
}

main();
