#!/usr/bin/env node
/**
 * Test opportunity stage automation.
 * Usage: node scripts/test-stage-automation.js <opportunityId> <eventType>
 * Example: node scripts/test-stage-automation.js <uuid> quote_sent
 *          node scripts/test-stage-automation.js <uuid> job_created --dry-run
 */

require('../lib/load-env');
const { advanceOpportunityStage, getTargetStageForEvent, EVENT_TO_STAGE } = require('../services/opportunityStageAutomation');
const { pool } = require('../lib/db');

async function main() {
  const opportunityId = process.argv[2];
  const eventType = process.argv[3];
  const dryRun = process.argv.includes('--dry-run');

  if (!opportunityId || !eventType) {
    console.log('Usage: node scripts/test-stage-automation.js <opportunityId> <eventType> [--dry-run]');
    console.log('Event types:', Object.keys(EVENT_TO_STAGE).join(', '));
    process.exit(1);
  }

  const target = getTargetStageForEvent(eventType);
  console.log('Target stage for', eventType, ':', target);

  const result = await advanceOpportunityStage(opportunityId, eventType, { dryRun, log: console.log });
  console.log('Result:', result);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
