/**
 * Quote follow-up: single place for template and rules.
 * 7-day follow-up only; extend later for day-2 / day-4 / day-10.
 */

const QUOTE_FOLLOWUP_DAYS = 7;

const SMS_TEMPLATE = `Hi {{first_name}}, just checking whether you had any questions about the quote we sent through. Happy to clarify anything if needed.`;

function getFirstFirstName(name) {
  if (!name || typeof name !== 'string') return 'there';
  const first = (name.trim().split(/\s+/)[0] || '').trim();
  return first || 'there';
}

function renderQuoteFollowUpSms(contactName) {
  return SMS_TEMPLATE.replace(/\{\{first_name\}\}/g, getFirstFirstName(contactName));
}

module.exports = {
  QUOTE_FOLLOWUP_DAYS,
  SMS_TEMPLATE,
  getFirstFirstName,
  renderQuoteFollowUpSms,
};
