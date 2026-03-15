/**
 * Normalize for display/storage: digits only, AU 61->0, length check 9-10.
 */
function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return null;

  const trimmed = phone.trim();
  if (!trimmed) return null;

  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (/^\+61/.test(trimmed) || /^61/.test(digits)) {
    if (digits.length >= 3 && digits.startsWith('61') && digits[2] === '4') {
      digits = '0' + digits.slice(2);
    }
  }

  if (digits.length < 9 || digits.length > 10) return null;
  return digits;
}

/**
 * Digits-only normalization for matching. No length check.
 * Safe for null/undefined/empty. Use for contact lookup and phone_digits storage.
 */
function normalizePhoneDigits(input) {
  if (input == null || (typeof input !== 'string' && typeof input !== 'number')) return null;
  const s = String(input).trim();
  if (!s) return null;
  let digits = s.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length >= 3 && digits.startsWith('61') && digits[2] === '4') {
    digits = '0' + digits.slice(2);
  }
  return digits;
}

module.exports = { normalizePhone, normalizePhoneDigits };

