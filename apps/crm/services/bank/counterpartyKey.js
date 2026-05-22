/**
 * Stable counterparty fingerprint from bank description.
 */

function normalizeDescription(desc) {
  let s = String(desc || '').trim().toUpperCase();
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/\bREF\s*[:\-]?\s*\w+/gi, '');
  s = s.replace(/\b\d{2}\/\d{2}\/\d{2,4}\b/g, '');
  s = s.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '');
  return s.trim();
}

function buildCounterpartyKey(descriptionNorm) {
  let s = normalizeDescription(descriptionNorm).toLowerCase();
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  s = s.replace(/\b(payment|transfer|de|eftpos|visa|payid|osko)\b/gi, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return 'unknown';
  const tokens = s.split(' ').filter((t) => t.length > 1);
  return tokens.slice(0, 6).join(' ').slice(0, 200) || 'unknown';
}

module.exports = {
  normalizeDescription,
  buildCounterpartyKey,
};
