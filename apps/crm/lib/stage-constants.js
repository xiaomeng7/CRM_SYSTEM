/**
 * Centralized opportunity stage constants.
 * Use these instead of magic strings to avoid typos and drift.
 * Pipeline (display → DB value): New Lead, Attempting Contact, Qualified, Inspection Booked,
 * Inspection Completed, Report Sent, Quoted, Negotiation, Won, Lost.
 */

/** CRM opportunity stages (DB values, snake_case) */
const OPPORTUNITY_STAGES = {
  NEW_LEAD: 'new_inquiry',
  ATTEMPTING_CONTACT: 'attempting_contact',
  QUALIFIED: 'qualified',
  INSPECTION_BOOKED: 'site_visit_booked',
  INSPECTION_COMPLETED: 'inspection_done',
  REPORT_SENT: 'report_sent',
  QUOTED: 'quote_sent',
  NEGOTIATION: 'decision_pending',
  WON: 'won',
  LOST: 'lost',
  // Legacy aliases
  NEW_INQUIRY: 'new_inquiry',
  SITE_VISIT_BOOKED: 'site_visit_booked',
  INSPECTION_DONE: 'inspection_done',
  QUOTE_SENT: 'quote_sent',
  DECISION_PENDING: 'decision_pending',
};

/** Order for pipeline progression (lower index = earlier stage) */
const STAGE_ORDER = [
  OPPORTUNITY_STAGES.NEW_LEAD,
  OPPORTUNITY_STAGES.ATTEMPTING_CONTACT,
  OPPORTUNITY_STAGES.QUALIFIED,
  OPPORTUNITY_STAGES.INSPECTION_BOOKED,
  OPPORTUNITY_STAGES.INSPECTION_COMPLETED,
  OPPORTUNITY_STAGES.REPORT_SENT,
  OPPORTUNITY_STAGES.QUOTED,
  OPPORTUNITY_STAGES.NEGOTIATION,
  OPPORTUNITY_STAGES.WON,
  OPPORTUNITY_STAGES.LOST,
];

/** Stages that are closed — automation must not overwrite */
const CLOSED_STAGES = [OPPORTUNITY_STAGES.WON, OPPORTUNITY_STAGES.LOST];

/** System event → target stage (for advanceOpportunityStage) */
const EVENT_TO_STAGE = {
  job_created: OPPORTUNITY_STAGES.INSPECTION_BOOKED,
  inspection_completed: OPPORTUNITY_STAGES.INSPECTION_COMPLETED,
  report_sent: OPPORTUNITY_STAGES.REPORT_SENT,
  quote_sent: OPPORTUNITY_STAGES.QUOTED,
  quote_accepted: OPPORTUNITY_STAGES.WON,
  quote_declined: OPPORTUNITY_STAGES.LOST,
  /** Task outcome: user marked not interested → Lost (via stage engine only) */
  not_interested: OPPORTUNITY_STAGES.LOST,
};

/** Quote status → opportunity stage mapping (from ServiceM8 quote sync) */
const QUOTE_STATUS_TO_STAGE = {
  quote_sent: OPPORTUNITY_STAGES.QUOTED,
  sent: OPPORTUNITY_STAGES.QUOTED,
  quote_accepted: OPPORTUNITY_STAGES.WON,
  accepted: OPPORTUNITY_STAGES.WON,
  quote_declined: OPPORTUNITY_STAGES.LOST,
  declined: OPPORTUNITY_STAGES.LOST,
};

/** Quote follow-up states */
const QUOTE_FOLLOWUP_STATE = {
  NONE: 'none',
  SCHEDULED: 'scheduled',
  DUE: 'due',
  SENT: 'sent',
  SKIPPED: 'skipped',
};

/** Source identifiers for audit */
const AUDIT_SOURCE = {
  QUOTE_SYNC: 'quote-sync',
  QUOTE_WEBHOOK: 'quote-webhook',
  QUOTE_FOLLOWUP: 'quote-followup',
  SERVICEM8_SYNC: 'servicem8-sync',
  STAGE_AUTOMATION: 'stage-automation',
};

module.exports = {
  OPPORTUNITY_STAGES,
  STAGE_ORDER,
  CLOSED_STAGES,
  EVENT_TO_STAGE,
  QUOTE_STATUS_TO_STAGE,
  QUOTE_FOLLOWUP_STATE,
  AUDIT_SOURCE,
};
