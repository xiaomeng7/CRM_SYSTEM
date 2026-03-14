function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const value = email.trim().toLowerCase();
  if (!value) return null;
  if (value.length < 5) return null;
  if (!value.includes('@')) return null;
  return value;
}

module.exports = { normalizeEmail };

