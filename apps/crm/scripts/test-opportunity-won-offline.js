#!/usr/bin/env node
/**
 * Minimal verification: enqueue opportunity_won offline conversion row for a CRM opportunity.
 *
 *   cd apps/crm && node scripts/test-opportunity-won-offline.js <opportunity_uuid>
 *
 * Requires: DATABASE_URL, table google_offline_conversion_events (046).
 * Optional env for pending (not skipped): GOOGLE_ADS_OFFLINE_CONVERSION_ACTION_OPPORTUNITY_WON,
 * lead/opportunity with trusted gclid per pickTrustedGclid().
 *
 * After enqueue, inspect:
 *   GET /api/admin/google-offline-conversions?event_type=opportunity_won&sync_secret=...
 *   npm run google-offline-conversions:upload:dry
 */

require('../lib/load-env');

const { pool } = require('../lib/db');
const {
  enqueueOpportunityWonConversionEvent,
  listGoogleOfflineConversionEvents,
} = require('../services/googleOfflineConversions');

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error('Usage: node scripts/test-opportunity-won-offline.js <opportunity_uuid>');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  try {
    const out = await enqueueOpportunityWonConversionEvent(id, {
      source: 'script.test-opportunity-won-offline',
    });
    console.log('enqueue result:', JSON.stringify(out, null, 2));

    const rows = await listGoogleOfflineConversionEvents(
      { event_type: 'opportunity_won', limit: 5 },
      pool
    );
    const mine = rows.filter((r) => String(r.opportunity_id) === id);
    console.log('recent opportunity_won rows for this id:', JSON.stringify(mine, null, 2));
  } catch (e) {
    console.error(e.message || e);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

main();
