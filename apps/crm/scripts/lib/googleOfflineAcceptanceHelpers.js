/**
 * Helpers for Google Offline Conversion Phase 1/2 acceptance runner only.
 * Mirrors production SQL where noted; keep in sync with googleOfflineConversions.js.
 */

const STALE_PROCESSING_MS = 30 * 60 * 1000;
const MAX_UPLOAD_ATTEMPTS = 5;

const ACCEPTANCE_DEDUPE_PREFIX = 'acceptance_test:';

function normalizeApiBase() {
  const raw = (process.env.CRM_BASE_URL || 'http://localhost:3000/api').trim();
  return raw.replace(/\/$/, '');
}

async function fetchAdminJson(relPath) {
  const base = normalizeApiBase();
  const path = relPath.startsWith('/') ? relPath.slice(1) : relPath;
  const url = `${base}/${path}`;
  const headers = { Accept: 'application/json' };
  const sec = process.env.SYNC_SECRET || process.env.ADMIN_SECRET;
  if (sec) headers['x-sync-secret'] = sec;
  const res = await fetch(url, { headers });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_) {
    body = { _raw: text };
  }
  return { ok: res.ok, status: res.status, body };
}

/** Same stale recovery as production recoverStaleProcessingRows. */
async function recoverStaleProcessingRows(pool) {
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);
  await pool.query(
    `UPDATE google_offline_conversion_events
     SET status = 'pending',
         updated_at = NOW()
     WHERE status = 'processing'
       AND COALESCE(last_attempt_at, created_at) < $1::timestamptz`,
    [staleBefore.toISOString()]
  );
}

/**
 * Eligibility fragment matching uploadPendingGoogleOfflineConversions claim (pending or retriable failed).
 */
function eligibleWhereFragment() {
  return `
    platform = 'google'
    AND (
      status = 'pending'
      OR (
        status = 'failed'
        AND retry_count < $1
        AND (next_retry_at IS NULL OR next_retry_at <= NOW())
      )
    )`;
}

async function cleanupAcceptanceRows(pool) {
  await pool.query(
    `DELETE FROM google_offline_conversion_events
     WHERE dedupe_key LIKE $1`,
    [`${ACCEPTANCE_DEDUPE_PREFIX}%`]
  );
}

/** Valid gclid shape for upload pipeline (isLikelyGclid). */
function stubGclid(suffix) {
  const core = `AccTest_${String(suffix).replace(/[^A-Za-z0-9_]/g, '_')}_`;
  return `${core}GclidStub0123456789`;
}

module.exports = {
  ACCEPTANCE_DEDUPE_PREFIX,
  MAX_UPLOAD_ATTEMPTS,
  STALE_PROCESSING_MS,
  normalizeApiBase,
  fetchAdminJson,
  recoverStaleProcessingRows,
  eligibleWhereFragment,
  cleanupAcceptanceRows,
  stubGclid,
};
