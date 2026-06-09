#!/usr/bin/env node
/**
 * PR8D — Builder Research UI integration tests (static file checks).
 *
 * Usage:
 *   pnpm --filter @bht/crm run test:builder-research-ui-integration
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

function testHtmlResearchSection(html) {
  console.log('\n=== HTML: Research Profile section ===\n');
  assert(html.includes('id="bi-research-section"'), 'bi-research-section exists');
  assert(html.includes('Research Profile'), 'Research Profile heading');
  assert(html.includes('id="bi-btn-run-research"'), 'Run Website Research button');
  assert(html.includes('Save Research Profile'), 'Save Research Profile button');
  assert(html.includes('id="bi-btn-mark-researched"'), 'Mark as Researched button');
  assert(html.includes('id="bi-research-runs"'), 'research runs container');
  assert(html.includes('id="bi-profile_summary"'), 'profile_summary field');
  assert(html.includes('id="bi-quality_signals"'), 'quality_signals field');
  assert(html.includes('id="bi-risk_signals"'), 'risk_signals field');
  assert(html.includes('Contact This Week'), 'contact this week heading');
  assert(html.includes('Strategic Builders'), 'strategic builders section');
  assert(html.includes('id="bi-relationship_strength"'), 'relationship strength field');
  assert(html.includes('id="bi-founder_notes"'), 'founder notes field');
  assert(html.includes('Builder Fit Snapshot'), 'snapshot heading');
  assert(html.includes('id="bi-why-bht-fit"'), 'why bht fit list');
  assert(html.includes('id="bi-opportunity-summary"'), 'opportunity list');
  assert(html.includes('id="bi-recommended-action"'), 'recommended action');
  assert(html.includes('id="bi-score-breakdown-list"'), 'score breakdown list');
  assert(html.includes('id="bi-research_source_display"'), 'research source display');
  assert(html.includes('id="bi-last_researched_display"'), 'last researched display');
  assert(html.includes('bi-section-hidden'), 'sections use bi-section-hidden class');
  console.log('  OK: HTML contains Research Profile DOM');
}

function testJsProfileEndpoints(js) {
  console.log('\n=== JS: profile API integration ===\n');
  assert(js.includes('/profile'), 'references profile endpoint');
  assert(js.includes('/research-runs'), 'references research-runs endpoint');
  assert(js.includes('/research/run'), 'references research run endpoint');
  assert(js.includes('loadProfileAndRuns'), 'loadProfileAndRuns function');
  assert(js.includes('setSectionVisible'), 'setSectionVisible toggles section visibility');
  assert(js.includes('bi-section-hidden'), 'JS toggles bi-section-hidden class');
  assert(js.includes('renderFitSnapshot'), 'renders fit snapshot');
  assert(js.includes('renderScoreBreakdown'), 'renders score breakdown');
  assert(js.includes('fitBandFromScore'), 'fit band helper');
  assert(js.includes('x-admin-secret'), 'write ops use x-admin-secret header');
  console.log('  OK: JS calls profile / research endpoints');
}

function testJsRunWebsiteResearch(js) {
  console.log('\n=== JS: Run Website Research ===\n');
  assert(js.includes('Run Website Research'), 'Run Website Research label');
  assert(js.includes('function runWebsiteResearch'), 'runWebsiteResearch handler');
  assert(js.includes("btn.textContent = 'Researching…'"), 'loading state on button');
  assert(js.includes('loadProfileAndRuns(id)'), 'refreshes profile after research');
  console.log('  OK: Run Website Research wired');
}

function testJsVisibilityRules(js) {
  console.log('\n=== JS: section visibility for add vs detail ===\n');
  assert(js.includes('setSectionVisible(researchSection, !isNew)'), 'research visible when not new');
  assert(js.includes('setSectionVisible(noteSection, !isNew)'), 'notes visible when not new');
  assert(!js.includes('researchSection.hidden = isNew'), 'does not rely on hidden attribute alone');
  console.log('  OK: existing builder shows research; add mode hides it');
}

function testCssPanelScroll(css) {
  console.log('\n=== CSS: panel scroll + section hidden ===\n');
  assert(css.includes('.bi-panel-body'), 'panel body scroll container');
  assert(css.includes('.bi-section-hidden'), 'bi-section-hidden rule');
  assert(css.includes('display: none !important'), 'section hidden is enforced');
  console.log('  OK: drawer scroll and section visibility CSS');
}

function main() {
  const html = read(HTML);
  const js = read(JS);
  const css = read(CSS);

  testHtmlResearchSection(html);
  testJsProfileEndpoints(js);
  testJsRunWebsiteResearch(js);
  testJsVisibilityRules(js);
  testCssPanelScroll(css);

  console.log('\nAll PR8D UI integration checks passed.\n');
}

main();
