const router = require('express').Router();
const { pool } = require('../../lib/db');
const { normalizePhone } = require('../../lib/crm/cleaning');

router.post('/twilio/inbound-sms', async (req, res) => {
  try {
    const from = req.body.From || req.body.from;
    const to = req.body.To || req.body.to;
    const body = req.body.Body || req.body.body;
    const messageSid = req.body.MessageSid || req.body.MessageSid || req.body.SmsMessageSid || req.body.smsMessageSid;

    if (!from || !body) {
      return res.status(400).json({ ok: false, error: 'Missing required fields: From, Body' });
    }

    const normalizedFrom = normalizePhone(String(from));

    if (!normalizedFrom) {
      console.warn('Twilio inbound SMS with un-normalizable From:', from);
    }

    let contact = null;
    if (normalizedFrom) {
      const contactResult = await pool.query(
        `SELECT c.id, c.name, c.account_id
         FROM contacts c
         WHERE c.phone = $1
         LIMIT 1`,
        [normalizedFrom]
      );
      contact = contactResult.rows[0] || null;
    }

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
      console.warn('Twilio inbound SMS could not match contact for From:', from, 'normalized:', normalizedFrom);
      await pool.query(
        `INSERT INTO activities (contact_id, lead_id, opportunity_id, activity_type, summary, created_by)
         VALUES (NULL, NULL, NULL, 'inbound_sms_unmatched', $1, 'twilio-webhook')`,
        [summary]
      );
    }

    return res.status(200).json({ ok: true, matched_contact: !!contact, message_sid: messageSid || null });
  } catch (err) {
    console.error('Error handling Twilio inbound SMS webhook:', err);
    return res.status(500).json({ ok: false, error: 'Internal error' });
  }
});

module.exports = router;

