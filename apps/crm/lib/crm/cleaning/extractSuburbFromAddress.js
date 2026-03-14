const { normalizeSuburb } = require('./normalizeSuburb');

const STATE_CODES = ['nsw', 'vic', 'qld', 'sa', 'wa', 'tas', 'nt', 'act'];
const STREET_TYPES = [
  'st',
  'street',
  'rd',
  'road',
  'ave',
  'avenue',
  'dr',
  'drive',
  'ct',
  'court',
  'ln',
  'lane',
  'pl',
  'place',
  'pde',
  'parade',
  'hwy',
  'highway',
];

function extractSuburbFromAddress(addressLine) {
  if (!addressLine || typeof addressLine !== 'string') return null;
  const raw = addressLine.trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();

  // Find state code position
  const stateMatch = lower.match(
    /\b(nsw|vic|qld|sa|wa|tas|nt|act)\b/
  );
  if (!stateMatch) return null;

  const stateIdx = stateMatch.index;
  if (stateIdx == null || stateIdx <= 0) return null;

  // Take the part before the state code
  const beforeState = lower.slice(0, stateIdx).trim();
  if (!beforeState) return null;

  // Prefer comma-separated segment after the last comma
  const lastComma = beforeState.lastIndexOf(',');
  if (lastComma !== -1 && lastComma < beforeState.length - 1) {
    const suburbCandidate = beforeState.slice(lastComma + 1);
    return normalizeSuburb(suburbCandidate);
  }

  // Tokenize and try to split street vs suburb by street type
  const tokens = beforeState.split(/\s+/);
  if (!tokens.length) return null;

  const streetTypeIndex = findLastStreetTypeIndex(tokens);
  let suburbTokens;
  if (streetTypeIndex !== -1 && streetTypeIndex < tokens.length - 1) {
    suburbTokens = tokens.slice(streetTypeIndex + 1);
  } else {
    // Fallback: take last 2-3 tokens as suburb
    const start = Math.max(tokens.length - 3, 0);
    suburbTokens = tokens.slice(start);
  }

  const filtered = suburbTokens.filter((t) => t && !/^\d+$/.test(t));
  if (!filtered.length) return null;

  const suburbRaw = filtered.join(' ');
  return normalizeSuburb(suburbRaw);
}

function findLastStreetTypeIndex(tokens) {
  let idx = -1;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].replace(/[.,]/g, '').toLowerCase();
    if (STREET_TYPES.includes(t)) idx = i;
  }
  return idx;
}

module.exports = { extractSuburbFromAddress };

