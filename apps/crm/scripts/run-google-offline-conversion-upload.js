#!/usr/bin/env node
/**
 * Google Offline Conversion uploader — cron / Railway friendly.
 *
 *   cd apps/crm && npm run google-offline-conversions:upload
 *   GOOGLE_OFFLINE_UPLOAD_LIMIT=50 npm run google-offline-conversions:upload
 *   npm run google-offline-conversions:upload:dry
 *
 * Persists one row to sync_runs (039+) per non-dry run; see GET /api/admin/google-offline-conversions/runs.
 */

require('../lib/load-env');

const { pool } = require('../lib/db');
const { uploadPendingGoogleOfflineConversions } = require('../services/googleOfflineConversions');

function parseArgs(argv) {
  const dry =
    argv.includes('--dry-run') ||
    argv.includes('--dry') ||
    String(process.env.GOOGLE_OFFLINE_UPLOAD_DRY_RUN || '').trim() === '1';
  let limit = process.env.GOOGLE_OFFLINE_UPLOAD_LIMIT || process.env.LIMIT;
  const li = argv.indexOf('--limit');
  if (li >= 0 && argv[li + 1]) limit = argv[li + 1];
  return { dryRun: dry, limit };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[google-offline-upload] ERROR DATABASE_URL is required.');
    process.exit(1);
  }

  const { dryRun, limit } = parseArgs(process.argv.slice(2));

  try {
    console.log('[google-offline-upload] START', new Date().toISOString());
    console.log(JSON.stringify({ dry_run: dryRun, limit: limit || 'default' }));

    const summary = await uploadPendingGoogleOfflineConversions({
      db: pool,
      dryRun,
      limit,
    });

    console.log('[google-offline-upload] SUMMARY', JSON.stringify(summary, null, 2));
    console.log('[google-offline-upload] OK');
  } catch (e) {
    console.error('[google-offline-upload] FAIL', e.message || e);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
  process.exit(process.exitCode || 0);
}

main();
