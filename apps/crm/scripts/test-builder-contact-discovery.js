#!/usr/bin/env node
/**
 * PR10B — Builder contact discovery tests.
 */

require('../lib/load-env');
const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');
const {
  extractFromHtml,
  pickRecommendedContact,
} = require('../services/builder/contactDiscovery/extractContactCandidates');
const {
  runContactDiscovery,
  confirmBuilderContact,
  listBuilderContacts,
} = require('../services/builder/contactDiscovery/builderContactDiscoveryService');
const { createBuilderProspect } = require('../services/builder/builderProspectService');
const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'public/builder-intelligence.html');
const JS = path.join(ROOT, 'public/js/builder-intelligence.js');
const TEST_PREFIX = 'test_pr10b_';
const createdProspectIds = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function ensureMigrations() {
  const sql = fs.readFileSync(path.join(__dirname, '../database/079_builder_contact_discovery.sql'), 'utf8');
  await pool.query(sql);
}

async function cleanup() {
  if (createdProspectIds.length) {
    await pool.query(`DELETE FROM builder_contacts WHERE prospect_id = ANY($1::uuid[])`, [createdProspectIds]);
    await pool.query(`DELETE FROM builder_contact_discovery_runs WHERE prospect_id = ANY($1::uuid[])`, [
      createdProspectIds,
    ]);
    await pool.query(`DELETE FROM builder_pipeline_activity WHERE prospect_id = ANY($1::uuid[])`, [
      createdProspectIds,
    ]);
    await pool.query(`DELETE FROM b2b_prospects WHERE id = ANY($1::uuid[])`, [createdProspectIds]);
  }
  await pool.query(`DELETE FROM b2b_prospects WHERE company_name LIKE $1`, [`${TEST_PREFIX}%`]);
}

function testExtractor() {
  console.log('\n=== Contact extraction ===\n');
  const html = `
    <html><body>
      <h2>Our Team</h2>
      <p>John Smith - Director</p>
      <a href="mailto:john@examplebuilder.com.au">Email John</a>
      <a href="tel:0412345678">Call</a>
      <a href="https://www.linkedin.com/in/john-smith-builder">LinkedIn</a>
    </body></html>
  `;
  const candidates = extractFromHtml(html, 'https://examplebuilder.com.au/team', 'website');
  assert(candidates.length > 0, 'extracts candidates');
  const recommended = pickRecommendedContact(candidates);
  assert(recommended && recommended.name === 'John Smith', 'picks named director');
  assert(recommended.role === 'Director', 'role detected');
  assert(recommended.email === 'john@examplebuilder.com.au', 'email detected');
  console.log('extractor OK');
}

function testUiAssets() {
  console.log('\n=== UI assets ===\n');
  const html = fs.readFileSync(HTML, 'utf8');
  const js = fs.readFileSync(JS, 'utf8');
  assert(html.includes('bi-section-contact-discovery'), 'contact discovery section');
  assert(html.includes('bi-btn-run-contact-discovery'), 'run button');
  assert(html.includes('bi-btn-confirm-contact'), 'confirm button');
  assert(html.includes('bi-btn-batch-contact-discovery'), 'batch button');
  assert(js.includes('runContactDiscoveryForCurrent'), 'run handler');
  assert(js.includes('confirmRecommendedContact'), 'confirm handler');
  assert(js.includes('batchContactDiscovery'), 'batch handler');
  console.log('UI assets OK');
}

async function testServiceIntegration() {
  console.log('\n=== Service integration ===\n');
  const prospect = await createBuilderProspect({
    company_name: `${TEST_PREFIX} Contact Builder`,
    website: 'https://example-pr10b.test',
    research_status: 'researched',
    pipeline_stage: 'contact_discovery',
  });
  createdProspectIds.push(prospect.id);

  const discovery = await runContactDiscovery(prospect.id, {
    db: pool,
    fetchBuilderWebsite: async () => ({
      homepage_url: 'https://example-pr10b.test',
      pages: [
        {
          url: 'https://example-pr10b.test/team',
          html: '<p>Jane Doe - Estimator</p><a href="mailto:jane@example-pr10b.test">Email</a>',
        },
      ],
    }),
    fetch: async () => ({ ok: false }),
  });

  assert(discovery.contacts.length > 0, 'stores contacts');
  assert(discovery.recommended_contact, 'recommended contact set');
  const contacts = await listBuilderContacts(prospect.id, { db: pool });
  assert(contacts.some((c) => c.is_recommended), 'recommended flag in db');

  const confirmed = await confirmBuilderContact(prospect.id, discovery.recommended_contact.id, { db: pool });
  assert(confirmed.prospect.pipeline_stage === 'contact_ready', 'moves to contact_ready');
  assert(confirmed.prospect.contact_name || confirmed.prospect.decision_maker_name, 'writes prospect contact');
  console.log('service integration OK');
}

async function main() {
  try {
    await ensureMigrations();
    testExtractor();
    testUiAssets();
    await testServiceIntegration();
    console.log('\nPR10B builder contact discovery tests passed.\n');
  } finally {
    await cleanup();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  cleanup()
    .then(() => pool.end())
    .finally(() => process.exit(1));
});
