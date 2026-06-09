/**
 * Deterministic suggested actions for collections_risk events (PR7D).
 */

function generateCollectionsActions(event) {
  const payload = event.payload || {};
  return [
    {
      action_type: 'collections_call',
      title: 'Call customer regarding overdue invoice',
      description: 'Review payment status and request payment update.',
      priority: 1,
      payload: {
        invoice_id: payload.invoice_id || null,
        invoice_number: payload.invoice_number || null,
        customer: payload.customer || null,
      },
    },
    {
      action_type: 'collections_review',
      title: 'Review invoice history',
      description: 'Check previous reminders and payment behaviour.',
      priority: 2,
      payload: {
        invoice_id: payload.invoice_id || null,
        days_overdue: payload.days_overdue ?? null,
      },
    },
    {
      action_type: 'collections_review',
      title: 'Assess escalation path',
      description:
        'Determine whether builder, owner or accounts contact should be engaged.',
      priority: 3,
      payload: {
        payment_risk: payload.payment_risk || null,
        overdue_level: payload.overdue_level || null,
      },
    },
  ];
}

module.exports = { generateCollectionsActions };
