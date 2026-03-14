function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return null;

  const trimmed = phone.trim();
  if (!trimmed) return null;

  // Keep digits only
  let digits = trimmed.replace(/\D/g, '');

  if (!digits) return null;

  // Handle +61 mobile variants: +614XXXXXXXX or 614XXXXXXXX -> 04XXXXXXXX
  if (/^\+61/.test(trimmed) || /^61/.test(digits)) {
    if (digits.length >= 3 && digits.startsWith('61') && digits[2] === '4') {
      digits = '0' + digits.slice(2);
    }
  }

  // Basic AU mobile / phone length check: accept 9–10 digits
  if (digits.length < 9 || digits.length > 10) {
    return null;
  }

  return digits;
}

module.exports = { normalizePhone };

