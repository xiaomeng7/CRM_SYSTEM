const { normalizePhone } = require('./normalizePhone');
const { normalizeEmail } = require('./normalizeEmail');
const { normalizeName } = require('./normalizeName');
const { normalizeSuburb } = require('./normalizeSuburb');
const { extractSuburbFromAddress } = require('./extractSuburbFromAddress');
const { detectSuspiciousContact } = require('./detectSuspiciousContact');
const { cleanContact } = require('./cleanContact');
const { cleanAccount } = require('./cleanAccount');

module.exports = {
  normalizePhone,
  normalizeEmail,
  normalizeName,
  normalizeSuburb,
  detectSuspiciousContact,
  cleanContact,
  cleanAccount,
  extractSuburbFromAddress,
};

