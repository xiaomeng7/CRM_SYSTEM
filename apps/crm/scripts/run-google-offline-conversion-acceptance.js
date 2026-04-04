#!/usr/bin/env node
/**
 * Google Offline Conversions — Phase 1/2 automated acceptance (V1).
 *
 *   cd apps/crm && npm run google-offline-conversions:acceptance
 *   npm run google-offline-conversions:acceptance:simulate   # sets SIMULATE in env early
 *
 * Requires: DATABASE_URL, table google_offline_conversion_events (046+048+049).
 * API checks: CRM_BASE_URL (default http://localhost:3000/api), optional SYNC_SECRET / ADMIN_SECRET.
 * Does not call real Google Ads API (simulate for upload step).
 */

require('../lib/load-env');

const { pool } = require('../lib/db');
const {
  ACCEPTANCE_DEDUPE_PREFIX,
  MAX_UPLOAD_ATTEMPTS,
  normalizeApiBase,
  fetchAdminJson,
  recoverStaleProcessingRows,
  eligibleWhereFragment,
  cleanupAcceptanceRows,
  stubGclid,
} = require('./lib/googleOfflineAcceptanceHelpers');

const { uploadPendingGoogleOfflineConversions } = require('../services/googleOfflineConversions');

const results = [];

function logPass(name, detail) {
  results.push({ level: 'PASS', name, detail });
  console.log(`[PASS] ${name}${detail ? ` — ${detail}` : ''}`);
}

function logFail(name, detail) {
  results.push({ level: 'FAIL', name, detail });
  console.error(`[FAIL] ${name}${detail ? ` — ${detail}` : ''}`);
}

function logSkip(name, detail) {
  results.push({ level: 'SKIP', name, detail });
  console.log(`[SKIP] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function checkSchema(poolClient) {
  const name = 'migration / schema (049)';
  try {
    const col = await poolClient.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'google_offline_conversion_events'
         AND column_name = 'last_retry_at'`
    );
    if (!col.rows.length) {
      logFail(name, 'column last_retry_at missing');
      return;
    }

    const chk = await poolClient.query(
      `SELECT pg_get_constraintdef(oid) AS def
       FROM pg_constraint
       WHERE conrelid = 'google_offline_conversion_events'::regclass
         AND conname = 'chk_google_offline_status'`
    );
    const def = String(chk.rows[0]?.def || '');
    if (!def.includes('processing')) {
      logFail(name, 'CHECK does not include processing');
      return;
    }
    if (def.includes('permanent_failed')) {
      logFail(name, 'CHECK still references permanent_failed');
      return;
    }

    const bad = await poolClient.query(
      `SELECT COUNT(*)::bigint AS n FROM google_offline_conversion_events WHERE status = 'permanent_failed'`
    );
    const n = Number(bad.rows[0]?.n ?? 0);
    if (n > 0) {
      logFail(name, `found ${n} row(s) with status permanent_failed`);
      return;
    }

    logPass(name, 'last_retry_at + CHECK + no permanent_failed rows');
  } catch (e) {
    logFail(name, e.message || String(e));
  }
}

async function checkSummaryApi() {
  const name = 'summary API smoke';
  try {
    const { ok, status, body } = await fetchAdminJson('admin/google-offline-conversions/summary');
    if (!ok) {
      logFail(name, `HTTP ${status} ${JSON.stringify(body).slice(0, 200)}`);
      return;
    }
    const keys = [
      'conversion_rates_by_event_type',
      'skipped_reason_breakdown',
      'avg_seconds_to_send_by_event_type',
      'gclid_nonempty_by_event_type',
    ];
    const missing = keys.filter((k) => body[k] === undefined);
    if (missing.length) {
      logFail(name, `missing keys: ${missing.join(', ')}`);
      return;
    }
    logPass(name, `CRM ${normalizeApiBase()}`);
  } catch (e) {
    logFail(name, e.message || String(e));
  }
}

async function checkTimelineApi(poolClient) {
  const name = 'timeline API smoke';
  try {
    const opp = await poolClient.query(
      `SELECT id FROM opportunities ORDER BY created_at DESC NULLS LAST LIMIT 1`
    );
    if (!opp.rows.length) {
      logSkip(name, 'no opportunity row in DB');
      return;
    }
    const id = opp.rows[0].id;
    const { ok, status, body } = await fetchAdminJson(
      `admin/google-offline-conversions/${id}/timeline`
    );
    if (!ok) {
      logFail(name, `HTTP ${status} ${JSON.stringify(body).slice(0, 200)}`);
      return;
    }
    if (!Array.isArray(body.timeline)) {
      logFail(name, 'body.timeline is not an array');
      return;
    }
    if (!body.raw || typeof body.raw !== 'object') {
      logFail(name, 'body.raw missing or not object');
      return;
    }
    const rawKeys = ['opportunity', 'domain_events', 'automation_audit_log', 'invoices', 'offline_conversion_events'];
    const miss = rawKeys.filter((k) => !(k in body.raw));
    if (miss.length) {
      logFail(name, `raw missing keys: ${miss.join(', ')}`);
      return;
    }
    logPass(name, `opportunity_id=${id}`);
  } catch (e) {
    logFail(name, e.message || String(e));
  }
}

async function checkRetryEligibility() {
  const name = 'retry / exhausted eligibility (SQL vs uploader)';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await cleanupAcceptanceRows(client);

    const dedupeOk = `${ACCEPTANCE_DEDUPE_PREFIX}retry_ok:${Date.now()}`;
    const dedupeEx = `${ACCEPTANCE_DEDUPE_PREFIX}retry_exhausted:${Date.now()}`;
    const g = stubGclid('retry');

    const insOk = await client.query(
      `INSERT INTO google_offline_conversion_events (
         status, event_type, platform, dedupe_key, gclid,
         conversion_action_resource_name, conversion_action_name,
         conversion_time, conversion_value, source_payload_json, created_by,
         retry_count, next_retry_at
       ) VALUES (
         'failed', 'acceptance_test', 'google', $1, $2,
         'customers/1/conversionActions/1', 'acceptance',
         NOW(), 0, '{"acceptance_test":true,"case":"retry_eligible"}'::jsonb, 'acceptance-script',
         2, NOW() - INTERVAL '1 hour'
       ) RETURNING id`,
      [dedupeOk, g]
    );
    const idOk = insOk.rows[0].id;

    const insEx = await client.query(
      `INSERT INTO google_offline_conversion_events (
         status, event_type, platform, dedupe_key, gclid,
         conversion_action_resource_name, conversion_action_name,
         conversion_time, conversion_value, source_payload_json, created_by,
         retry_count, next_retry_at
       ) VALUES (
         'failed', 'acceptance_test', 'google', $1, $2,
         'customers/1/conversionActions/1', 'acceptance',
         NOW(), 0, '{"acceptance_test":true,"case":"retry_exhausted"}'::jsonb, 'acceptance-script',
         5, NULL
       ) RETURNING id`,
      [dedupeEx, g]
    );
    const idEx = insEx.rows[0].id;

    const frag = eligibleWhereFragment();
    const okRow = await client.query(
      `SELECT id FROM google_offline_conversion_events WHERE id = $2 AND ${frag}`,
      [MAX_UPLOAD_ATTEMPTS, idOk]
    );
    const exRow = await client.query(
      `SELECT id FROM google_offline_conversion_events WHERE id = $2 AND ${frag}`,
      [MAX_UPLOAD_ATTEMPTS, idEx]
    );

    await client.query('ROLLBACK');
    await cleanupAcceptanceRows(pool);

    if (okRow.rows.length !== 1) {
      logFail(name, 'eligible failed row (retry_count<5, next_retry_at past) not matched by uploader WHERE');
      return;
    }
    if (exRow.rows.length !== 0) {
      logFail(name, 'exhausted row (retry_count>=5) incorrectly matched as eligible');
      return;
    }
    logPass(name, 'eligible vs exhausted');
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    await cleanupAcceptanceRows(pool).catch(() => {});
    logFail(name, e.message || String(e));
  } finally {
    client.release();
  }
}

async function checkStaleProcessingReset() {
  const name = 'stale processing → pending';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await cleanupAcceptanceRows(client);

    const dedupe = `${ACCEPTANCE_DEDUPE_PREFIX}stale:${Date.now()}`;
    const g = stubGclid('stale');
    const old = new Date(Date.now() - 40 * 60 * 1000).toISOString();

    const ins = await client.query(
      `INSERT INTO google_offline_conversion_events (
         status, event_type, platform, dedupe_key, gclid,
         conversion_action_resource_name, conversion_action_name,
         conversion_time, conversion_value, source_payload_json, created_by,
         last_attempt_at, created_at, updated_at
       ) VALUES (
         'processing', 'acceptance_test', 'google', $1, $2,
         'customers/1/conversionActions/1', 'acceptance',
         NOW(), 0, '{"acceptance_test":true,"case":"stale_processing"}'::jsonb, 'acceptance-script',
         $3::timestamptz, $3::timestamptz, $3::timestamptz
       ) RETURNING id`,
      [dedupe, g, old]
    );
    const id = ins.rows[0].id;

    await recoverStaleProcessingRows(client);

    const after = await client.query(`SELECT status FROM google_offline_conversion_events WHERE id = $1`, [id]);
    await client.query('ROLLBACK');
    await cleanupAcceptanceRows(pool);

    if (String(after.rows[0]?.status) !== 'pending') {
      logFail(name, `expected pending, got ${after.rows[0]?.status}`);
      return;
    }
    logPass(name, 'recoverStaleProcessingRows');
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    await cleanupAcceptanceRows(pool).catch(() => {});
    logFail(name, e.message || String(e));
  } finally {
    client.release();
  }
}

async function checkSimulateUpload() {
  const name = 'simulate upload (no Google API)';
  const prevSim = process.env.GOOGLE_OFFLINE_UPLOAD_SIMULATE;
  process.env.GOOGLE_OFFLINE_UPLOAD_SIMULATE = '1';

  try {
    await cleanupAcceptanceRows(pool);

    const dedupe = `${ACCEPTANCE_DEDUPE_PREFIX}sim:${Date.now()}`;
    const g = stubGclid('sim');
    const oldCreated = '1970-01-01T00:00:00.000Z';

    await pool.query(
      `INSERT INTO google_offline_conversion_events (
         status, event_type, platform, dedupe_key, gclid,
         conversion_action_resource_name, conversion_action_name,
         conversion_time, conversion_value, source_payload_json, created_by,
         created_at, updated_at
       ) VALUES (
         'pending', 'acceptance_test', 'google', $1, $2,
         'customers/1/conversionActions/1', 'acceptance',
         NOW(), 0, '{"acceptance_test":true,"case":"simulate_upload"}'::jsonb, 'acceptance-script',
         $3::timestamptz, $3::timestamptz
       )`,
      [dedupe, g, oldCreated]
    );

    await uploadPendingGoogleOfflineConversions({
      db: pool,
      limit: 5,
      dryRun: false,
    });

    const row = await pool.query(
      `SELECT status, response_payload_json FROM google_offline_conversion_events WHERE dedupe_key = $1`,
      [dedupe]
    );
    const st = String(row.rows[0]?.status || '');
    const resp = row.rows[0]?.response_payload_json;
    const respStr = typeof resp === 'object' && resp !== null ? JSON.stringify(resp) : String(resp || '');

    await cleanupAcceptanceRows(pool);

    if (st !== 'sent') {
      logFail(name, `expected status sent, got ${st}`);
      return;
    }
    if (!/simulated/i.test(respStr) && resp?.simulated !== true) {
      logFail(name, 'response_payload_json missing simulated stub');
      return;
    }
    logPass(name, 'row marked sent with stub response');
  } catch (e) {
    await cleanupAcceptanceRows(pool).catch(() => {});
    logFail(name, e.message || String(e));
  } finally {
    if (prevSim === undefined) delete process.env.GOOGLE_OFFLINE_UPLOAD_SIMULATE;
    else process.env.GOOGLE_OFFLINE_UPLOAD_SIMULATE = prevSim;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[FAIL] DATABASE_URL is required');
    process.exit(1);
  }

  let exitCode = 0;
  try {
    console.log(`[info] CRM_BASE_URL=${normalizeApiBase()}`);
    console.log('[info] Test rows use dedupe_key prefix:', ACCEPTANCE_DEDUPE_PREFIX);
    console.log('');

    await checkSchema(pool);
    await checkSummaryApi();
    await checkTimelineApi(pool);
    await checkRetryEligibility();
    await checkStaleProcessingReset();
    await checkSimulateUpload();

    const passed = results.filter((r) => r.level === 'PASS').length;
    const failed = results.filter((r) => r.level === 'FAIL').length;
    const skipped = results.filter((r) => r.level === 'SKIP').length;
    const total = results.length;

    console.log('');
    console.log('--- summary ---');
    console.log(`total:   ${total}`);
    console.log(`passed:  ${passed}`);
    console.log(`failed:  ${failed}`);
    console.log(`skipped: ${skipped}`);

    if (failed > 0) {
      console.error('\nAcceptance failed.');
      exitCode = 1;
    } else {
      console.log('\nAcceptance OK.');
    }
  } catch (e) {
    console.error(e);
    exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
  process.exit(exitCode);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
