const assert = require('assert');
const {
  normalizePhone,
  normalizeEmail,
  normalizeName,
  normalizeSuburb,
  detectSuspiciousContact,
  cleanContact,
} = require('../apps/crm/lib/crm/cleaning');

function run() {
  // Phone normalization
  assert.strictEqual(normalizePhone('0412 345 678'), '0412345678');
  assert.strictEqual(normalizePhone('+61412345678'), '0412345678');

  // Email normalization
  assert.strictEqual(normalizeEmail('TEST@GMAIL.COM'), 'test@gmail.com');

  // Name normalization
  assert.strictEqual(normalizeName('  Meng   Zhang '), 'Meng Zhang');

  // Suburb normalization
  assert.strictEqual(normalizeSuburb('mawson lakes'), 'Mawson Lakes');
  assert.strictEqual(normalizeSuburb('MAWSON LAKES'), 'Mawson Lakes');

  // Suspicious contact detection
  assert.strictEqual(detectSuspiciousContact('Help Guide Job', null, null), true);
  assert.strictEqual(detectSuspiciousContact('Card Payment', null, null), true);
  assert.strictEqual(detectSuspiciousContact('Normal Person', null, 'test@example.com'), false);

  // cleanContact skip
  const suspicious = cleanContact({ name: 'Help Guide Job', phone: null, email: null });
  assert.strictEqual(suspicious.skip, true);

  const normal = cleanContact({ name: '  Meng   Zhang ', phone: '0412 345 678', email: 'TEST@GMAIL.COM' });
  assert.strictEqual(normal.skip, false);
  assert.strictEqual(normal.name, 'Meng Zhang');
  assert.strictEqual(normal.phone, '0412345678');
  assert.strictEqual(normal.email, 'test@gmail.com');

  console.log('cleaning.test.js passed');
}

if (require.main === module) {
  run();
}

module.exports = { run };

