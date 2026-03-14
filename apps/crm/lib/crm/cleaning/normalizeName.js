function normalizeName(name) {
  if (!name || typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\s+/g, ' ');
}

module.exports = { normalizeName };

