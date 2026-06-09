/**
 * Deterministic suggested actions for cashflow_risk events (PR7D).
 */

function generateCashflowActions(event) {
  const payload = event.payload || {};
  return [
    {
      action_type: 'cashflow_review',
      title: 'Review next 14 day obligations',
      description: 'Compare expected outflows against high-certainty income for the next two weeks.',
      priority: 1,
      payload: { snapshot_date: payload.snapshot_date || null },
    },
    {
      action_type: 'cashflow_review',
      title: 'Review overdue invoices',
      description: 'Identify which outstanding invoices drive the largest cash gap.',
      priority: 2,
      payload: { gap_amount: payload.gap_amount ?? null },
    },
    {
      action_type: 'cashflow_collection',
      title: 'Prioritise collections',
      description: 'Focus follow-up on the highest-value overdue invoices first.',
      priority: 3,
      payload: {},
    },
    {
      action_type: 'cashflow_review',
      title: 'Validate supplier commitments',
      description: 'Confirm upcoming supplier and payroll commitments against bank reality.',
      priority: 4,
      payload: { expected_expenses: payload.expected_expenses ?? null },
    },
  ];
}

module.exports = { generateCashflowActions };
