#!/usr/bin/env node
/**
 * Operational detectors runner (PR7B+).
 *
 * Usage:
 *   node jobs/run-operational-detectors.js
 *   node jobs/run-operational-detectors.js --dry-run
 */

require('../lib/load-env');
const { pool } = require('../lib/db');
const { runCollectionsRiskDetector } = require('../services/operations/detectors/collectionsRiskDetector');
const { runBuilderFollowupDetector } = require('../services/operations/detectors/builderFollowupDetector');
const { refreshBuilderTargetScores } = require('../services/builder/targetSelection/refreshBuilderTargetScores');
const { runBuilderPriorityDetector } = require('../services/operations/detectors/builderPriorityDetector');

function parseArgs(argv) {
  const out = { dryRun: false };
  for (const arg of argv) {
    if (arg === '--dry-run') out.dryRun = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log('[operational-detectors] start dry_run=%s', args.dryRun);

  const collections = await runCollectionsRiskDetector({
    dryRun: args.dryRun,
    log: console.log,
  });

  console.log('\n=== Collections Risk ===');
  console.log(JSON.stringify(collections, null, 2));

  const builderFollowup = await runBuilderFollowupDetector({
    dryRun: args.dryRun,
    log: console.log,
  });

  console.log('\n=== Builder Follow-up ===');
  console.log(JSON.stringify(builderFollowup, null, 2));

  if (!args.dryRun) {
    const refreshStats = await refreshBuilderTargetScores({
      runDetector: false,
      log: console.log,
    });
    console.log('\n=== Builder Priority Refresh ===');
    console.log(JSON.stringify(refreshStats, null, 2));
  }

  const builderPriority = await runBuilderPriorityDetector({
    dryRun: args.dryRun,
    log: console.log,
  });

  console.log('\n=== Builder Priority ===');
  console.log(JSON.stringify(builderPriority, null, 2));

  // Future: cashflowRiskDetector(), leadDetector()

  console.log('\n[operational-detectors] done');
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('[operational-detectors] fatal:', err);
    pool.end();
    process.exit(1);
  });
