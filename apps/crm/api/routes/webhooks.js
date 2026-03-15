const router = require('express').Router();
const { pool } = require('../../lib/db');
const { normalizePhoneDigits } = require('../../lib/crm/cleaning');
const { processQuoteEvent } = require('../../services/quote-sync');

/** Match contact by inbound number: phone_digits first, then fallback to legacy phone. */
async function matchContactByInboundPhone(from) {
  const digits = normalizePhoneDigits(from);
  if (!digits) return { contact: null, strategy: 'unmatched', digits: null };

  const digits61 = (digits.length === 10 && digits[0] === '0') ? '61' + digits.slice(1) : digits;

  const rows = await pool.query(
    `SELECT c.id, c.name, c.account_id,
            CASE WHEN c.phone_digits IS NOT NULL AND c.phone_digits <> '' AND c.phone_digits = $1 THEN 'digits'
                 WHEN c.phone_digits IS NOT NULL AND c.phone_digits <> '' THEN 'none'
                 WHEN regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g') IN ($1, $2) THEN 'legacy'
                 ELSE 'none' END AS match_type
       FROM contacts c
       WHERE (c.phone_digits IS NOT NULL AND c.phone_digits <> '' AND c.phone_digits = $1)
          OR (COALESCE(c.phone_digits, '') = '' AND regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g') IN ($1, $2))
       ORDER BY (c.phone_digits IS NOT NULL AND c.phone_digits <> '') DESC, c.updated_at DESC
       LIMIT 2`,
    [digits, digits61]
  );

  if (rows.rows.length === 0) {
    return { contact: null, strategy: 'unmatched', digits };
  }
  const primary = rows.rows[0];
  const strategy = primary.match_type === 'digits' ? 'digits' : 'legacy';
  const contact = { id: primary.id, name: primary.name, account_id: primary.account_id };
  if (rows.rows.length > 1) {
    return { contact, strategy: strategy + '_multi_took_primary', digits };
  }
  return { contact, strategy, digits };
}

router.post('/twilio/inbound-sms', async (req, res) => {
  try {
    const from = req.body.From || req.body.from;
    const to = req.body.To || req.body.to;
    const body = req.body.Body || req.body.body;
    const messageSid = req.body.MessageSid || req.body.MessageSid || req.body.SmsMessageSid || req.body.smsMessageSid;

    if (!from || !body) {
      return res.status(400).json({ ok: false, error: 'Missing required fields: From, Body' });
    }

    const fromStr = String(from).trim();
    const { contact: contactRow, strategy, digits } = await matchContactByInboundPhone(fromStr);

    if (!digits) {
      console.warn('[inbound-sms] un-normalizable From:', fromStr, '| strategy: unmatched');
    } else {
      console.log('[inbound-sms] from_raw=%s digits=%s strategy=%s contact_id=%s', fromStr, digits, strategy, contactRow ? contactRow.id : null);
    }

    const contact = contactRow;

    const summary = body.length > 500 ? body.slice(0, 497) + '...' : body;

    if (contact) {
      // Record inbound SMS activity
      await pool.query(
        `INSERT INTO activities (contact_id, lead_id, opportunity_id, activity_type, summary, created_by)
         VALUES ($1, NULL, NULL, 'inbound_sms', $2, 'twilio-webhook')`,
        [contact.id, summary]
      );

      // Minimal duplicate prevention: avoid creating multiple follow-up tasks in 24h for same contact
      const duplicateCheck = await pool.query(
        `SELECT 1
         FROM tasks
         WHERE contact_id = $1
           AND created_by = 'twilio-webhook'
           AND created_at >= NOW() - INTERVAL '24 hours'
         LIMIT 1`,
        [contact.id]
      );

      if (duplicateCheck.rows.length === 0) {
        const contactName = (contact.name || '').trim() || 'customer';
        const title = `Follow up SMS reply from ${contactName}`;

        await pool.query(
          `INSERT INTO tasks (contact_id, lead_id, opportunity_id, inspection_id, title, status, due_at, created_by)
           VALUES ($1, NULL, NULL, NULL, $2, 'open', NOW(), 'twilio-webhook')`,
          [contact.id, title]
        );
      }
    } else {
      console.warn('[inbound-sms] no contact match from_raw=%s digits=%s strategy=unmatched', fromStr, digits);
      await pool.query(
        `INSERT INTO activities (contact_id, lead_id, opportunity_id, activity_type, summary, created_by)
         VALUES (NULL, NULL, NULL, 'inbound_sms_unmatched', $1, 'twilio-webhook')`,
        [summary]
      );
    }

    return res.status(200).json({
      ok: true,
      matched_contact: !!contact,
      message_sid: messageSid || null,
      match_strategy: strategy || 'unmatched',
    });
  } catch (err) {
    console.error('Error handling Twilio inbound SMS webhook:', err);
    return res.status(500).json({ ok: false, error: 'Internal error' });
  }
});

/**
 * ServiceM8 quote event webhook (or manual trigger).
 * Body: { event, quote_uuid, job_uuid, status, decline_reason?, lost_reason? }
 * Event/status: quote_sent | quote_accepted | quote_declined
 */
router.post('/servicem8/quote', async (req, res) => {
  try {
    const secret = process.env.SYNC_SECRET || process.env.ADMIN_SECRET;
    if (secret) {
      const provided = req.headers['x-sync-secret'] || req.query.sync_secret || req.body?.sync_secret;
      if (provided !== secret) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }
    }

    const payload = req.body || {};
    const db = await pool.connect();
    try {
      const result = await processQuoteEvent(db, payload, { log: (m) => console.log('[quote-webhook]', m) });
      res.json({ ok: true, ...result });
    } finally {
      db.release();
    }
  } catch (err) {
    console.error('Quote webhook error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;

