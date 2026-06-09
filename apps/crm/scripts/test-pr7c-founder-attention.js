#!/usr/bin/env node
/**
 * PR7C — Founder Attention API smoke (optional, server running).
 *
 * Usage:
 *   pnpm --filter @bht/crm run job:operational-detectors
 *   CRM_BASE_URL=http://localhost:3000 ADMIN_SECRET=xxx \
 *     pnpm --filter @bht/crm run test:pr7c-founder-attention
 */

require('../lib/load-env');

const BASE = (process.env.CRM_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log('PR7C Founder Attention API smoke');
  console.log('Base:', BASE);

  const headers = { Accept: 'application/json' };
  const secret = process.env.ADMIN_SECRET || process.env.SYNC_SECRET || '';
  if (secret) headers['x-admin-secret'] = secret;

  const attRes = await fetch(`${BASE}/api/operational-events/attention?limit=20`, { headers });
  const attBody = await attRes.json();
  assert(attRes.ok && attBody.ok, 'GET /attention failed: ' + (attBody.error || attRes.status));
  console.log('GET /attention:', attBody.count, 'events');
  if (attBody.events.length > 1) {
    const a = attBody.events[0].effective_attention_score || 0;
    const b = attBody.events[1].effective_attention_score || 0;
    assert(a >= b, 'should be sorted by effective_attention_score DESC');
  }
  if (attBody.events[0]) {
    console.log('  top:', {
      score: attBody.events[0].effective_attention_score,
      severity: attBody.events[0].severity,
      title: attBody.events[0].title,
    });
  }

  const sumRes = await fetch(`${BASE}/api/operational-events/summary`, { headers });
  const sumBody = await sumRes.json();
  assert(sumRes.ok && sumBody.ok, 'GET /summary failed');
  assert(Array.isArray(sumBody.top_attention), 'top_attention present');
  console.log('GET /summary top_attention:', sumBody.top_attention.length);

  console.log('\nUI: open /ceo-daily.html — TODAY\'S ATTENTION at top');
  console.log('All PR7C API smoke passed.');
}

main().catch((e) => {
  console.error('FAILED:', e.message || e);
  process.exit(1);
});
