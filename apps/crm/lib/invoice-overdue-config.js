/**
 * Invoice overdue automation: single place for levels and SMS template.
 */

const OVERDUE_LEVEL = {
  NONE: 'none',
  DAYS_3: '3_days',
  DAYS_7: '7_days',
  DAYS_14: '14_days',
};

const CREATED_BY = 'invoice-overdue';

const SMS_TEMPLATE_3 = `Hi {{first_name}}, just a friendly reminder that invoice {{invoice_number}} is currently outstanding. Please let us know if you need the invoice resent.`;

const SMS_TEMPLATE_7 = `Hi {{first_name}}, this is a second reminder that invoice {{invoice_number}} is still outstanding. Please get in touch if you have any questions.`;

const SMS_TEMPLATE_14 = `Hi {{first_name}}, invoice {{invoice_number}} is now overdue. Please contact us to arrange payment.`;

const TASK_TITLE_3 = 'Invoice payment reminder';
const TASK_TITLE_7 = 'Second payment reminder';
const TASK_TITLE_14 = 'Invoice overdue escalation';

function getFirstFirstName(name) {
  if (!name || typeof name !== 'string') return 'there';
  const first = (name.trim().split(/\s+/)[0] || '').trim();
  return first || 'there';
}

function renderSms(level, contactName, invoiceNumber) {
  const first = getFirstFirstName(contactName);
  const tpl = level === '3_days' ? SMS_TEMPLATE_3 : level === '7_days' ? SMS_TEMPLATE_7 : SMS_TEMPLATE_14;
  return tpl.replace(/\{\{first_name\}\}/g, first).replace(/\{\{invoice_number\}\}/g, invoiceNumber || '');
}

module.exports = {
  OVERDUE_LEVEL,
  CREATED_BY,
  SMS_TEMPLATE_3,
  SMS_TEMPLATE_7,
  SMS_TEMPLATE_14,
  TASK_TITLE_3,
  TASK_TITLE_7,
  TASK_TITLE_14,
  getFirstFirstName,
  renderSms,
};
