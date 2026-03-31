/**
 * Inbound Reply Engine v1.1 — classify Twilio inbound SMS and act (tasks / SMS / DNC).
 * Webhook returns before running this (async). Requires OPENAI_API_KEY.
 */

const { pool } = require('../lib/db');
const { sendSMS } = require('@bht/integrations');

const CREATED_BY = 'inbound-reply-engine';
const RATE_WINDOW_HOURS = 1;
const RATE_MAX_AUTO_REPLIES = 2;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  const OpenAI = require('openai');
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

/**
 * Temporary bridge: newest lead for this contact only.
 * Backlog: bind outbound SMS to lead_id / thread (store on send; resolve inbound via Twilio
 * message/thread external id) so replies attach to the correct lead when a contact has many.
 */
async function resolveLatestLeadIdForContact(contactId) {
  if (!contactId) return null;
  const r = await pool.query(
    `SELECT id FROM leads WHERE contact_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [contactId]
  );
  return r.rows[0]?.id || null;
}

async function getTaskColumns() {
  const r = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'tasks'`
  );
  return new Set(r.rows.map((x) => x.column_name));
}

async function insertTask(opts) {
  const { contactId, leadId, title, dueAt, taskType } = opts;
  const cols = await getTaskColumns();
  const useType = taskType && cols.has('task_type');
  if (useType) {
    const ins = await pool.query(
      `INSERT INTO tasks (contact_id, lead_id, title, status, due_at, task_type, created_by)
       VALUES ($1, $2, $3, 'open', COALESCE($4, NOW()), $5, $6)
       RETURNING id`,
      [contactId, leadId || null, title, dueAt || null, taskType, CREATED_BY]
    );
    return ins.rows[0]?.id;
  }
  const ins = await pool.query(
    `INSERT INTO tasks (contact_id, lead_id, title, status, due_at, created_by)
     VALUES ($1, $2, $3, 'open', COALESCE($4, NOW()), $5)
     RETURNING id`,
    [contactId, leadId || null, title, dueAt || null, CREATED_BY]
  );
  return ins.rows[0]?.id;
}

/**
 * Outbound auto-replies in the last hour for this contact (SMS activities only).
 */
async function countAutoRepliesLastHour(contactId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM activities
     WHERE contact_id = $1
       AND created_by = $2
       AND activity_type IN ('sms', 'outbound_sms')
       AND occurred_at >= NOW() - INTERVAL '${RATE_WINDOW_HOURS} hours'`,
    [contactId, CREATED_BY]
  );
  return Number(r.rows[0]?.n || 0);
}

/** Extract SMS body from stored auto-reply activity summary. */
function parseAutoReplyBodyFromSummary(summary) {
  const s = String(summary || '');
  if (!s.startsWith('[auto-reply]')) return null;
  let rest = s.slice('[auto-reply]'.length).trim();
  const tag = ' | auto_reply=true';
  const idx = rest.indexOf(tag);
  if (idx >= 0) rest = rest.slice(0, idx).trim();
  return rest;
}

/** Most recent auto-reply SMS body for this contact in the rate window (same hour as cap). */
async function getLastAutoReplyBodyInWindow(contactId) {
  const r = await pool.query(
    `SELECT summary FROM activities
     WHERE contact_id = $1
       AND created_by = $2
       AND activity_type IN ('sms', 'outbound_sms')
       AND summary LIKE '[auto-reply]%'
       AND occurred_at >= NOW() - INTERVAL '${RATE_WINDOW_HOURS} hours'
     ORDER BY occurred_at DESC
     LIMIT 1`,
    [contactId, CREATED_BY]
  );
  const row = r.rows[0];
  return row ? parseAutoReplyBodyFromSummary(row.summary) : null;
}

async function recordOutboundSms(contactId, leadId, message, meta) {
  const summary =
    '[auto-reply] ' +
    String(message || '').slice(0, 450) +
    (meta?.auto_reply ? ' | auto_reply=true' : '');
  await pool.query(
    `INSERT INTO activities (contact_id, lead_id, activity_type, summary, created_by)
     VALUES ($1, $2, 'sms', $3, $4)`,
    [contactId, leadId || null, summary, CREATED_BY]
  );
}

/**
 * Classify into: interested | not_interested | question | urgent | unclear
 */
async function classifyMessage(body) {
  const client = getOpenAIClient();
  if (!client) throw new Error('OPENAI_API_KEY missing');
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    max_tokens: 80,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Classify the customer SMS reply for an electrical/energy business in Australia. ' +
          'Respond with JSON only: {"label":"interested"|"not_interested"|"question"|"urgent"|"unclear"}. ' +
          'interested = clear yes, wants to book or proceed, or positive go-ahead (e.g. yes, call me, sounds good). ' +
          'not_interested = opt out, stop, no thanks. ' +
          'question = asks a specific informational question (price, when you can attend, what is included). ' +
          'urgent = electrical emergency, no power, safety issue, or strongly time-critical (ASAP, need today, urgent timing). ' +
          'unclear = greeting-only, single-word acks (ok, hi), too vague to act on, or fragment with no clear ask.',
      },
      { role: 'user', content: String(body || '').slice(0, 2000) },
    ],
  });
  const raw = completion.choices[0]?.message?.content || '{}';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    return 'unclear';
  }
  const label = String(parsed.label || 'unclear').toLowerCase().trim();
  const allowed = ['interested', 'not_interested', 'question', 'urgent', 'unclear'];
  return allowed.indexOf(label) >= 0 ? label : 'unclear';
}

async function generateSmsText(kind, inboundBody, contactName) {
  const client = getOpenAIClient();
  if (!client) throw new Error('OPENAI_API_KEY missing');
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const system =
    kind === 'question'
      ? 'You are Meng at Better Home Technology (Adelaide electrical/energy). Reply in SMS style: short, friendly, helpful, Australian English. Max 2 sentences + optional sign-off. No markdown.'
      : 'You are Meng at Better Home Technology. The customer message was unclear. Send one short friendly SMS asking what they need. Max 2 sentences. Australian English.';
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.35,
    max_tokens: 120,
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: `Customer name (if any): ${contactName || 'there'}\nTheir message: ${String(inboundBody || '').slice(0, 1500)}`,
      },
    ],
  });
  return String(completion.choices[0]?.message?.content || '').trim().slice(0, 480);
}

/**
 * @param {object} message
 * @param {string} [message.activityId] — inbound activity id (intent update)
 * @param {string} message.contactId
 * @param {string} [message.leadId]
 * @param {string} message.from
 * @param {string} message.body
 */
async function handleInboundReply(message) {
  if (process.env.INBOUND_REPLY_ENGINE_DISABLED === 'true' || process.env.INBOUND_REPLY_ENGINE_DISABLED === '1') {
    return { skipped: true, reason: 'disabled' };
  }

  const contactId = message.contactId;
  const leadId = message.leadId || null;
  const body = String(message.body || '');
  const activityId = message.activityId || null;

  if (!contactId || !body) {
    return { skipped: true, reason: 'missing_contact_or_body' };
  }

  if (!process.env.OPENAI_API_KEY) {
    console.warn('[inbound-reply-engine] OPENAI_API_KEY missing, skip automation');
    return { skipped: true, reason: 'no_openai' };
  }

  try {
    const phoneRow = await pool.query(`SELECT phone, name FROM contacts WHERE id = $1`, [contactId]);
    const phone = phoneRow.rows[0]?.phone && String(phoneRow.rows[0].phone).trim();
    const contactName = phoneRow.rows[0]?.name || '';

    const label = await classifyMessage(body);

    if (activityId) {
      try {
        await pool.query(
          `UPDATE activities
           SET intent = $1, intent_classified = true, intent_source = 'openai', classified_at = NOW()
           WHERE id = $2`,
          [label, activityId]
        );
      } catch (e) {
        console.warn('[inbound-reply-engine] intent update skipped:', e.message);
      }
    }

    const result = { label, actions: [] };

    if (label === 'interested') {
      const tid = await insertTask({
        contactId,
        leadId,
        title: 'Call — customer replied (interested)',
        taskType: 'inbound_reply_interested',
      });
      result.actions.push({ type: 'task_call', task_id: tid });
      return result;
    }

    if (label === 'urgent') {
      const tid = await insertTask({
        contactId,
        leadId,
        title: '[URGENT] Call — inbound SMS (urgent / safety)',
        taskType: 'inbound_reply_urgent',
      });
      result.actions.push({ type: 'task_urgent', task_id: tid });
      return result;
    }

    if (label === 'not_interested') {
      await pool.query(
        `UPDATE contacts
         SET do_not_contact = true,
             do_not_contact_at = NOW(),
             do_not_contact_reason = COALESCE(do_not_contact_reason, '') || ' inbound_reply:not_interested',
             updated_at = NOW()
         WHERE id = $1`,
        [contactId]
      );
      result.actions.push({ type: 'dnc', contact_id: contactId });
      return result;
    }

    const needsAutoSms = label === 'question' || label === 'unclear';
    if (!needsAutoSms) {
      return result;
    }

    const n = await countAutoRepliesLastHour(contactId);
    if (n >= RATE_MAX_AUTO_REPLIES) {
      result.actions.push({ type: 'sms_skipped', reason: 'rate_limit_1h', count: n });
      return result;
    }

    if (!phone) {
      result.actions.push({ type: 'sms_skipped', reason: 'no_phone' });
      return result;
    }

    const replyText = await generateSmsText(label === 'question' ? 'question' : 'unclear', body, contactName);
    if (!replyText) {
      result.actions.push({ type: 'sms_skipped', reason: 'empty_generation' });
      return result;
    }

    const lastBody = await getLastAutoReplyBodyInWindow(contactId);
    if (lastBody !== null && replyText.trim() === lastBody.trim()) {
      result.actions.push({ type: 'sms_skipped', reason: 'duplicate_reply_text' });
      return result;
    }

    await sendSMS(phone, replyText);
    await recordOutboundSms(contactId, leadId, replyText, { auto_reply: true });
    result.actions.push({ type: 'sms_sent', auto_reply: true });

    return result;
  } catch (e) {
    console.warn('[inbound-reply-engine] error:', e.message || e);
    return { error: e.message || String(e) };
  }
}

module.exports = {
  handleInboundReply,
  resolveLatestLeadIdForContact,
  classifyMessage,
  generateSmsText,
  CREATED_BY,
  RATE_MAX_AUTO_REPLIES,
  RATE_WINDOW_HOURS,
};
