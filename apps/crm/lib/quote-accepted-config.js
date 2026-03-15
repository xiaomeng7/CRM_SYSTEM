/**
 * Quote Acceptance Automation — constants and SMS template.
 */

const CREATED_BY = 'quote-accepted-automation';
const TASK_TITLE = 'Prepare job execution';
const TASK_TYPE = 'job_preparation';

function getFirstFirstName(name) {
  if (!name || typeof name !== 'string') return 'there';
  const first = (name.trim().split(/\s+/)[0] || '').trim();
  return first || 'there';
}

function renderThankYouSms(contactName) {
  const first = getFirstFirstName(contactName);
  return `Hi ${first}, thank you for accepting the quote. Our team will schedule the work shortly.`;
}

module.exports = {
  CREATED_BY,
  TASK_TITLE,
  TASK_TYPE,
  getFirstFirstName,
  renderThankYouSms,
};
