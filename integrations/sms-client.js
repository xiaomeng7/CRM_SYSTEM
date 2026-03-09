/**
 * SMS Client using Twilio
 * Sends SMS messages and records delivery status
 */

const twilio = require('twilio');

/**
 * Send an SMS message via Twilio
 * @param {string} phone - Phone number (E.164 format)
 * @param {string} message - Message body
 * @returns {Promise<{sid: string, status: string}>} - Twilio message SID and status
 */
async function sendSMS(phone, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER must be set');
  }

  // Normalize phone number
  const normalized = normalizePhone(phone);
  if (!normalized) {
    throw new Error(`Invalid phone number: ${phone}`);
  }

  const client = twilio(accountSid, authToken);

  const twilioMessage = await client.messages.create({
    body: message,
    from: fromNumber,
    to: normalized,
  });

  return {
    sid: twilioMessage.sid,
    status: twilioMessage.status,
  };
}

/**
 * Normalize Australian phone numbers to E.164 format
 * Handles: 04xx xxx xxx, 04xxxxxxxx, +61 4xx xxx xxx, etc.
 */
function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return null;
  let cleaned = phone.replace(/\s+/g, '').replace(/[-()]/g, '');
  if (cleaned.startsWith('+61')) {
    return cleaned;
  }
  if (cleaned.startsWith('61') && cleaned.length >= 11) {
    return '+' + cleaned;
  }
  if (cleaned.startsWith('04') && cleaned.length === 10) {
    return '+61' + cleaned.substring(1);
  }
  if (cleaned.startsWith('4') && cleaned.length === 9) {
    return '+61' + cleaned;
  }
  // Assume already in valid format or return as-is for Twilio to validate
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.length >= 10) return '+' + (cleaned.startsWith('61') ? '' : '61') + cleaned.replace(/^0/, '');
  return null;
}

module.exports = { sendSMS, normalizePhone };
