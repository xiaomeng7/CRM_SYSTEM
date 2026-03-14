function normalizeSuburb(suburb) {
  if (!suburb || typeof suburb !== 'string') return null;
  const trimmed = suburb.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  const parts = lower.split(/\s+/);
  const capped = parts
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');

  return capped || null;
}

module.exports = { normalizeSuburb };

