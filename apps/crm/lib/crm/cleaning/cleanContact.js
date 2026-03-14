const { normalizeName } = require('./normalizeName');
const { normalizePhone } = require('./normalizePhone');
const { normalizeEmail } = require('./normalizeEmail');
const { detectSuspiciousContact } = require('./detectSuspiciousContact');

function cleanContact(input = {}) {
  const rawName = input.name || null;
  const rawPhone = input.phone || null;
  const rawEmail = input.email || null;

  const name = normalizeName(rawName);
  const phone = normalizePhone(rawPhone);
  const email = normalizeEmail(rawEmail);

  if (detectSuspiciousContact(name, phone, email)) {
    return { skip: true };
  }

  return {
    skip: false,
    name,
    phone,
    email,
  };
}

module.exports = { cleanContact };

