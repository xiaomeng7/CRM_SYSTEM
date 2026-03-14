const { normalizeName } = require('./normalizeName');
const { normalizePhone } = require('./normalizePhone');
const { normalizeEmail } = require('./normalizeEmail');

const SUSPICIOUS_KEYWORDS = [
  'job',
  'card',
  'paypal',
  'transfer',
  'payment',
  'help',
  'guide',
  'test',
];

function detectSuspiciousContact(name, phone, email) {
  const normName = normalizeName(name);
  const normPhone = normalizePhone(phone);
  const normEmail = normalizeEmail(email);

  if (normPhone || normEmail) return false;
  if (!normName) return false;

  const lowerName = normName.toLowerCase();
  return SUSPICIOUS_KEYWORDS.some((kw) => lowerName.includes(kw));
}

module.exports = { detectSuspiciousContact };

