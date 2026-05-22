#!/usr/bin/env node
/**
 * Smoke test Cashflow Intelligence API (server must be running).
 *
 * Usage:
 *   CRM_BASE_URL=http://localhost:3000 node scripts/test-cashflow-intel-api.js
 */

require('../lib/load-env');

const BASE = (process.env.CRM_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const SECRET = process.env.SYNC_SECRET || process.env.ADMIN_SECRET || '';

async function getJson(path) {
  const res = await fetch(BASE + path);
  const body = await res.json();
  return { status: res.status, body };
}

async function postJson(path, payload) {
  const headers = { 'Content-Type': 'application/json' };
  if (SECRET) {
    headers['X-Admin-Secret'] = SECRET;
  }
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  return { status: res.status, body };
}

async function main() {
  console.log('Base URL:', BASE);

  const latest = await getJson('/api/cashflow-intel/latest');
  console.log('\nGET /latest', latest.status);
  console.log(JSON.stringify(latest.body, null, 2).slice(0, 2000));

  const history = await getJson('/api/cashflow-intel/history?limit=3');
  console.log('\nGET /history', history.status);
  console.log(JSON.stringify(history.body, null, 2).slice(0, 1500));

  if (!SECRET) {
    console.log('\nSKIP POST /run (no SYNC_SECRET / ADMIN_SECRET in env)');
    return;
  }

  const run = await postJson('/api/cashflow-intel/run', { dry_run: true });
  console.log('\nPOST /run dry_run', run.status);
  console.log(JSON.stringify(run.body, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
