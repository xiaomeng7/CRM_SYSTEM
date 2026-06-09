#!/usr/bin/env node
/**
 * PR7D — operational event actions tests.
 *
 * Usage:
 *   pnpm --filter @bht/crm run db:operational-events-migration
 *   pnpm --filter @bht/crm run test:operational-actions
 */

require('../lib/load-env');
const { pool } = require('../lib/db');
const { createOperationalEvent } = require('../services/operations/createOperationalEvent');
const { generateEventActions } = require('../services/operations/generateEventActions');
const {
  listActionsForEvent,
  updateActionStatus,
} = require('../services/operations/actionService');

const TEST_KEY = 'test_pr7d:collections_risk:invoice:action-test';
const createdEventIds = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function cleanup() {
  await pool.query(`DELETE FROM operational_events WHERE event_key = $1`, [TEST_KEY]);
}

async function main() {
  console.log('PR7D operational actions tests\n');

  await cleanup();

  const event = await createOperationalEvent({
    event_key: TEST_KEY,
    event_type: 'collections_risk',
    severity: 'high',
    attention_score: 70,
    source: 'test',
    title: 'Test builder overdue $12,000',
    summary: 'Invoice 403\n37 days overdue',
    entity_type: 'invoice',
    entity_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    payload: {
      invoice_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      invoice_number: '403',
      customer: 'Builder XYZ',
      amount: 12000,
      days_overdue: 37,
      payment_risk: 'high',
      overdue_level: '14_days',
    },
  });
  createdEventIds.push(event.id);

  const gen1 = await generateEventActions(event);
  assert(gen1.generated === 3, 'collections should generate 3 actions, got ' + gen1.generated);
  assert(gen1.actions.length === 3, 'three actions in db');
  assert(
    gen1.actions[0].title.includes('Call customer'),
    'first action title'
  );
  console.log('1) generate collections actions OK');

  const reloaded = await listActionsForEvent(event.id);
  assert(reloaded.length === 3, 'reload 3 actions');
  console.log('2) persist + reload OK');

  const approved = await updateActionStatus(reloaded[0].id, 'approved');
  assert(approved.status === 'approved', 'approved status');
  console.log('3) status change approved OK');

  const dismissed = await updateActionStatus(reloaded[1].id, 'dismissed');
  assert(dismissed.status === 'dismissed', 'dismissed');
  console.log('4) dismiss OK');

  const gen2 = await generateEventActions(event);
  assert(gen2.generated === 3, 'regenerate inserts 3 new pending');
  const afterRegen = await listActionsForEvent(event.id);
  const pending = afterRegen.filter((a) => a.status === 'pending');
  assert(pending.length === 3, 'three pending after regen');
  const stillApproved = afterRegen.filter((a) => a.id === approved.id);
  assert(stillApproved.length === 1 && stillApproved[0].status === 'approved', 'approved kept');
  const stillDismissed = afterRegen.filter((a) => a.id === dismissed.id);
  assert(stillDismissed.length === 1 && stillDismissed[0].status === 'dismissed', 'dismissed kept');
  console.log('5) re-generate replaces pending only OK');

  const cashflow = await createOperationalEvent({
    event_key: 'test_pr7d:cashflow_risk:snapshot:2099-01-01',
    event_type: 'cashflow_risk',
    severity: 'medium',
    attention_score: 50,
    source: 'test',
    title: 'Cashflow shortfall',
    summary: 'Gap detected',
    payload: { snapshot_date: '2099-01-01', gap_amount: 5500 },
  });
  createdEventIds.push(cashflow.id);
  const cfGen = await generateEventActions(cashflow);
  assert(cfGen.generated === 4, 'cashflow generates 4 actions');
  console.log('6) cashflow generator OK:', cfGen.actions.map((a) => a.title).join(' | '));

  await cleanup();
  await pool.end();
  console.log('\nAll PR7D tests passed.');
}

main().catch((err) => {
  console.error('\nFAILED:', err.message || err);
  cleanup()
    .then(() => pool.end())
    .finally(() => process.exit(1));
});
