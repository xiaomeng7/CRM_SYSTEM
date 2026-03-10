/**
 * @bht/integrations
 * External service adapters for BHT Revenue OS.
 * Do not put CRM business logic here — only API wrappers and transport.
 */

const { ServiceM8Client } = require('./servicem8-client');
const { sendSMS, normalizePhone } = require('./sms-client');

module.exports = {
  ServiceM8Client,
  sendSMS,
  normalizePhone,
};
