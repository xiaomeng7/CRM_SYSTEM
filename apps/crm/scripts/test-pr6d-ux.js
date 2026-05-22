#!/usr/bin/env node
/**
 * Smoke test PR6D UX endpoints (server should be running).
 * Usage: CRM_BASE_URL=http://localhost:3000 node scripts/test-pr6d-ux.js
 */
require('../lib/load-env');

const BASE = (process.env.CRM_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

async function get(path) {
  const res = await fetch(BASE + path);
  const body = await res.json();
  return { status: res.status, body };
}

async function main() {
  console.log('Base:', BASE);

  const out = await get('/api/cashflow/outstanding-details?limit=5');
  console.log('\nGET /api/cashflow/outstanding-details', out.status);
  if (!out.body.ok) throw new Error(out.body.error || 'failed');
  console.log('  source:', out.body.source);
  console.log('  total:', out.body.total, 'count:', out.body.count);
  console.log('  sample:', (out.body.invoices || [])[0]);

  const intel = await get('/api/cashflow-intel/latest');
  console.log('\nGET /api/cashflow-intel/latest', intel.status);
  if (intel.body.snapshot) {
    const exp = intel.body.snapshot.facts?.expenses || {};
    console.log('  effective_total:', exp.effective_total);
    console.log('  expected_total:', exp.expected_total);
    console.log('  source:', exp.source);
    console.log('  generated_at:', intel.body.snapshot.metadata?.generated_at);
  } else {
    console.log('  (no snapshot)');
  }

  console.log('\nOK: PR6D API smoke passed.');
  console.log('UI: /bank-import.html · CEO Daily outstanding card click');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
