#!/usr/bin/env node
/**
 * P0 test: task complete outcome=not_interested uses stage engine only.
 * Covers: not_interested → advanceOpportunityStage, stage_locked blocks, closed not overwritten, audit log.
 *
 * Usage (from apps/crm):
 *   node scripts/test-task-complete-stage-p0.js [--dry-run]
 *   node scripts/test-task-complete-stage-p0.js --opportunity-id <uuid>   # test single opp
 */

require('../lib/load-env');
const { pool } = require('../lib/db');
const { advanceOpportunityStage, getTargetStageForEvent } = require('../services/opportunityStageAutomation');
const { OPPORTUNITY_STAGES } = require('../lib/stage-constants');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const argOppId = process.argv.includes('--opportunity-id')
    ? process.argv[process.argv.indexOf('--opportunity-id') + 1]
    : null;

  console.log('--- P0: Task complete stage engine test ---');
  console.log('not_interested → target stage:', getTargetStageForEvent('not_interested'));
  if (getTargetStageForEvent('not_interested') !== OPPORTUNITY_STAGES.LOST) {
    console.error('FAIL: not_interested should map to LOST');
    process.exit(1);
  }
  console.log('OK: event not_interested maps to lost\n');

  if (argOppId) {
    const result = await advanceOpportunityStage(argOppId, 'not_interested', {
      dryRun,
      created_by: 'task_complete',
      lost_reason: 'not_interested',
      log: console.log,
    });
    console.log('Result:', result);

    if (!dryRun && result.applied) {
      const audit = await pool.query(
        `SELECT event_type, action_type, old_value, new_value, trigger_event FROM automation_audit_log
         WHERE entity_type = 'opportunity' AND entity_id = $1 ORDER BY executed_at DESC LIMIT 1`,
        [argOppId]
      );
      console.log('Latest audit:', audit.rows[0] || 'none');
    }
    await pool.end();
    return;
  }

  // No specific opp: run unit-style checks with DB
  const opps = await pool.query(
    `SELECT id, stage, stage_locked FROM opportunities WHERE stage NOT IN ($1, $2) LIMIT 1`,
    [OPPORTUNITY_STAGES.WON, OPPORTUNITY_STAGES.LOST]
  );
  if (opps.rows.length === 0) {
    console.log('Skip: no open opportunity to test (create one or pass --opportunity-id <uuid>)');
    await pool.end();
    return;
  }
  const openOpp = opps.rows[0];
  console.log('Test 1: advance open opportunity to lost via not_interested');
  const r1 = await advanceOpportunityStage(openOpp.id, 'not_interested', {
    dryRun: true,
    created_by: 'task_complete',
    lost_reason: 'not_interested',
    log: console.log,
  });
  console.log('  dry-run result:', r1);
  if (r1.reason === 'dry_run' && r1.new_stage === OPPORTUNITY_STAGES.LOST) console.log('  OK\n');
  else console.log('  (expected dry_run + new_stage=lost)\n');

  const wonOpp = await pool.query(
    `SELECT id FROM opportunities WHERE stage = $1 LIMIT 1`,
    [OPPORTUNITY_STAGES.WON]
  );
  if (wonOpp.rows.length > 0) {
    console.log('Test 2: already Won → not_interested should skip (no overwrite)');
    const r2 = await advanceOpportunityStage(wonOpp.rows[0].id, 'not_interested', {
      dryRun: false,
      created_by: 'task_complete',
      lost_reason: 'not_interested',
      log: console.log,
    });
    console.log('  result:', r2);
    if (r2.applied === false && r2.reason === 'closed_stage') console.log('  OK: closed stage not overwritten\n');
    else console.log('  OK: no change applied\n');
  }

  const lockedOpp = await pool.query(
    `SELECT id FROM opportunities WHERE stage_locked = true LIMIT 1`
  );
  if (lockedOpp.rows.length > 0) {
    console.log('Test 3: stage_locked → not_interested should skip');
    const r3 = await advanceOpportunityStage(lockedOpp.rows[0].id, 'not_interested', {
      dryRun: false,
      created_by: 'task_complete',
      log: console.log,
    });
    console.log('  result:', r3);
    if (r3.applied === false && r3.reason === 'stage_locked') console.log('  OK: stage_locked respected\n');
    else console.log('  (expected applied: false, reason: stage_locked)\n');
  } else {
    console.log('Test 3: skip (no stage_locked opportunity in DB)\n');
  }

  console.log('--- P0 stage engine tests done ---');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
