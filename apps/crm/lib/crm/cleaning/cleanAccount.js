const { normalizeName } = require('./normalizeName');
const { normalizeSuburb } = require('./normalizeSuburb');

function cleanAccount(input = {}) {
  const name = normalizeName(input.name || null);
  const suburb = normalizeSuburb(input.suburb || null);

  const address_line =
    typeof input.address_line === 'string' && input.address_line.trim()
      ? input.address_line.trim()
      : null;

  const postcode =
    typeof input.postcode === 'string' && input.postcode.trim()
      ? input.postcode.trim()
      : null;

  return {
    name,
    suburb,
    address_line,
    postcode,
  };
}

module.exports = { cleanAccount };

