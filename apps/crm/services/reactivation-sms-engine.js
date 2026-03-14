/**
 * Reactivation SMS Engine
 * - buildReactivationMessage(contact, account)
 * - generateQueue(limit, minPriorityScore)
 * - sendBatch(batchId)
 */

const { pool } = require('../lib/db');
const { sendSMS } = require('@bht/integrations');

const CONTACT_ACTIVITY_TYPES = ['sms', 'inbound_sms', 'inbound_sms_unmatched', 'outbound_sms', 'call'];
const SEND_BATCH_MAX = 50;

const MESSAGE_TEMPLATES = {
  default_reactivation: `Hi {first_name}, this is Meng from Better Home Technology.

We worked together before on electrical work for your property.

Just checking if you need any electrical work, upgrades, or maintenance.

Reply here if you'd like me to call you.`,
  friendly_checkin: `Hi {first_name}, Meng here from Better Home Technology.

Just checking in to see if you need any electrical help at the moment.

Happy to help if needed.`,
  short_followup: `Hi {first_name}, this is Meng from Better Home Technology.

Just checking whether you need any electrical work or upgrades at the moment.

Reply here if you'd like a call.`,
  builder_business: `Hi {first_name}, this is Meng from Better Home Technology.

Just checking whether you need any support with upcoming electrical works, upgrades, or maintenance.

Happy to help if needed.`,
  investor_rental: `Hi {first_name}, this is Meng from Better Home Technology.

Just checking whether you need any electrical maintenance or upgrades for your property.

Reply here if you'd like me to call you.`,
};

function getFirstName(contact) {
  const name = (contact?.contact_name || contact?.name || '').trim();
  if (!name) return 'there';
  const first = name.split(/\s+/)[0];
  return first || 'there';
}

function applyTemplateToContact(templateKey, contact) {
  const tpl = MESSAGE_TEMPLATES[templateKey] || MESSAGE_TEMPLATES.default_reactivation;
  const first = getFirstName(contact);
  return tpl.replace(/\{first_name\}/g, first);
}

function buildReactivationMessage(contact, account) {
  const name = (contact?.contact_name || contact?.name || '').trim();
  const first = name ? name.split(/\s+/)[0] || name : null;
  const greeting = first ? `Hi ${first}` : 'Hi there';

  return `${greeting}, this is Meng from Better Home Technology.

We worked together before on electrical work for your property.

Just checking if you need any electrical work, upgrades, or maintenance.

Reply here if you'd like me to call you.`;
}

function genBatchId() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const r = Math.random().toString(36).slice(2, 6);
  return `${y}-${m}-${day}-batch-${r}`;
}

/**
 * Generate queue from crm_account_reactivation_contacts.
 * Excludes: recent 30d contact, already in queue (queued/preview/sent).
 */
async function generateQueue(options = {}) {
  const limit = Math.min(parseInt(options.limit, 10) || 20, 100);
  const minPriorityScore = parseInt(options.min_priority_score, 10) || 0;

  const batchId = genBatchId();

  // 1. Get candidates: filter first (exclude in_queue, recent 30d, dnc), then order, then limit
  const candRes = await pool.query(
    `SELECT c.account_id, c.account_name, c.suburb, c.contact_id, c.contact_name, c.phone,
            c.jobs_count, c.last_job_date, c.months_since_last_job, c.priority_score
     FROM crm_account_reactivation_contacts c
     WHERE c.phone IS NOT NULL AND TRIM(COALESCE(c.phone, '')) <> ''
       AND COALESCE(c.priority_score, 0) >= $1
       AND NOT EXISTS (
         SELECT 1 FROM reactivation_sms_queue q
         WHERE q.contact_id = c.contact_id AND q.status IN ('queued', 'preview', 'sent')
       )
       AND NOT EXISTS (
         SELECT 1 FROM activities a
         WHERE a.contact_id = c.contact_id AND a.activity_type = ANY($2)
           AND a.occurred_at >= NOW() - INTERVAL '30 days'
       )
       AND NOT EXISTS (
         SELECT 1 FROM contacts ct
         WHERE ct.id = c.contact_id AND (ct.do_not_contact = true OR ct.do_not_contact IS TRUE)
       )
     ORDER BY c.priority_score DESC
     LIMIT $3`,
    [minPriorityScore, CONTACT_ACTIVITY_TYPES, limit]
  );

  const toInsert = candRes.rows;

  if (toInsert.length === 0) {
    return { generated: 0, batch_id: batchId, items: [], reason: 'All candidates excluded (recent contact or already in queue)' };
  }

  const createdBy = options.created_by || 'reactivation-engine';

  for (const c of toInsert) {
    const msg = buildReactivationMessage(c, c);
    await pool.query(
      `INSERT INTO reactivation_sms_queue (account_id, contact_id, phone, message, status, batch_id, priority_score, created_by)
       VALUES ($1, $2, $3, $4, 'preview', $5, $6, $7)`,
      [c.account_id, c.contact_id, c.phone, msg, batchId, c.priority_score || 0, createdBy]
    );
  }

  const itemsRes = await pool.query(
    `SELECT q.id, q.account_id, q.contact_id, c.name AS contact_name, a.name AS account_name,
            q.phone, q.message, q.status, q.batch_id, q.priority_score
     FROM reactivation_sms_queue q
     LEFT JOIN contacts c ON c.id = q.contact_id
     LEFT JOIN accounts a ON a.id = q.account_id
     WHERE q.batch_id = $1
     ORDER BY q.priority_score DESC
     LIMIT 20`,
    [batchId]
  );

  const items = itemsRes.rows.map((r) => ({
    id: r.id,
    account_id: r.account_id,
    account_name: r.account_name,
    contact_id: r.contact_id,
    contact_name: r.contact_name,
    phone: r.phone,
    message_preview: (r.message || '').slice(0, 80) + (r.message?.length > 80 ? '...' : ''),
    status: r.status,
    priority_score: r.priority_score,
  }));

  return { generated: toInsert.length, batch_id: batchId, items };
}

/**
 * Add single contact to queue (from dashboard). Does not send.
 */
async function addToQueue(contactId, source = 'dashboard') {
  const contactRes = await pool.query(
    `SELECT c.id, c.name, c.phone, c.account_id, a.name AS account_name
     FROM contacts c
     LEFT JOIN accounts a ON a.id = c.account_id
     WHERE c.id = $1`,
    [contactId]
  );
  if (contactRes.rows.length === 0) throw new Error('Contact not found');
  const row = contactRes.rows[0];
  if (!row.phone || !String(row.phone).trim()) throw new Error('Contact has no phone number');

  const inQueue = await pool.query(
    `SELECT 1 FROM reactivation_sms_queue
     WHERE contact_id = $1 AND status IN ('queued', 'preview', 'sent')`,
    [contactId]
  );
  if (inQueue.rows.length > 0) throw new Error('Contact already in queue');

  const contact = { contact_name: row.name, name: row.name, phone: row.phone };
  const account = { name: row.account_name };
  const message = buildReactivationMessage(contact, account);

  const d = new Date();
  const batchId = 'dashboard-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const priorityScore = 50;

  await pool.query(
    `INSERT INTO reactivation_sms_queue (account_id, contact_id, phone, message, status, batch_id, priority_score, created_by)
     VALUES ($1, $2, $3, $4, 'preview', $5, $6, $7)`,
    [row.account_id, contactId, row.phone, message, batchId, priorityScore, source]
  );
  return { ok: true, batch_id: batchId };
}

/**
 * Update single queue item message.
 */
async function updateMessage(id, message) {
  if (!message) throw new Error('message cannot be empty');
  const check = await pool.query(`SELECT status FROM reactivation_sms_queue WHERE id = $1`, [id]);
  if (check.rows.length === 0) throw new Error('Queue item not found');
  if (check.rows[0].status === 'sent') throw new Error('Cannot edit message for sent items');
  const r = await pool.query(
    `UPDATE reactivation_sms_queue SET message = $1, updated_at = NOW() WHERE id = $2 RETURNING id, message`,
    [message, id]
  );
  return { id, message: r.rows[0].message };
}

/**
 * Apply template to entire batch (preview/queued only).
 */
async function applyTemplate(batchId, templateKey) {
  const tpl = MESSAGE_TEMPLATES[templateKey];
  if (!tpl) throw new Error('Unknown template_key: ' + templateKey);
  const res = await pool.query(
    `SELECT q.id, q.contact_id, c.name AS contact_name
     FROM reactivation_sms_queue q
     LEFT JOIN contacts c ON c.id = q.contact_id
     WHERE q.batch_id = $1 AND q.status IN ('preview', 'queued')`,
    [batchId]
  );
  let updated = 0;
  for (const row of res.rows) {
    const msg = applyTemplateToContact(templateKey, { contact_name: row.contact_name, name: row.contact_name });
    await pool.query(
      `UPDATE reactivation_sms_queue SET message = $1, updated_at = NOW() WHERE id = $2`,
      [msg, row.id]
    );
    updated++;
  }
  return { updated, template_key: templateKey };
}

/**
 * List queue items.
 */
async function listQueue(options = {}) {
  const { status, batch_id, limit = 100 } = options;
  let where = [];
  let params = [];
  let i = 1;

  if (status) {
    where.push(`status = $${i++}`);
    params.push(status);
  }
  if (batch_id) {
    where.push(`batch_id = $${i++}`);
    params.push(batch_id);
  }
  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  params.push(Math.min(parseInt(limit, 10) || 100, 200));

  const res = await pool.query(
    `SELECT q.id, q.account_id, q.contact_id, q.phone, q.message, q.status, q.batch_id, q.priority_score, q.sent_at, q.created_at,
            c.name AS contact_name, a.name AS account_name
     FROM reactivation_sms_queue q
     LEFT JOIN contacts c ON c.id = q.contact_id
     LEFT JOIN accounts a ON a.id = q.account_id
     ${whereClause}
     ORDER BY q.created_at DESC
     LIMIT $${i}`,
    params
  );

  const countParams = params.slice(0, -1);
  const countRes = await pool.query(
    `SELECT COUNT(*) AS total FROM reactivation_sms_queue ${whereClause}`,
    countParams
  );
  const total = Number(countRes.rows[0]?.total || 0);

  const items = res.rows.map((r) => ({
    id: r.id,
    account_id: r.account_id,
    account_name: r.account_name,
    contact_id: r.contact_id,
    contact_name: r.contact_name,
    phone: r.phone,
    message: r.message,
    message_preview: (r.message || '').slice(0, 100),
    status: r.status,
    batch_id: r.batch_id,
    priority_score: r.priority_score,
    sent_at: r.sent_at,
    created_at: r.created_at,
  }));

  const batchId = batch_id || (items[0]?.batch_id);
  const created = batchId
    ? await pool.query(
        `SELECT MIN(created_at) AS created_at FROM reactivation_sms_queue WHERE batch_id = $1`,
        [batchId]
      ).then((r) => r.rows[0]?.created_at)
    : null;

  return { items, total, batch_id: batchId, created_at: created };
}

/**
 * Send batch. Only preview/queued. Serial send, max SEND_BATCH_MAX.
 */
async function sendBatch(batchId) {
  const res = await pool.query(
    `SELECT id, contact_id, phone, message
     FROM reactivation_sms_queue
     WHERE batch_id = $1 AND status IN ('preview', 'queued')
     ORDER BY priority_score DESC
     LIMIT $2`,
    [batchId, SEND_BATCH_MAX]
  );

  const rows = res.rows;
  if (rows.length === 0) {
    return { attempted: 0, sent: 0, failed: 0, reason: 'No preview/queued items in batch' };
  }

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await sendSMS(row.phone, row.message);
      await pool.query(
        `UPDATE reactivation_sms_queue SET status = 'sent', sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [row.id]
      );
      await pool.query(
        `INSERT INTO activities (contact_id, lead_id, opportunity_id, activity_type, summary, created_by)
         VALUES ($1, NULL, NULL, 'outbound_sms', $2, 'reactivation-engine')`,
        [row.contact_id, (row.message || '').slice(0, 500)]
      );
      sent++;
    } catch (err) {
      console.error(`Reactivation send failed ${row.id}:`, err.message);
      await pool.query(
        `UPDATE reactivation_sms_queue SET status = 'failed', updated_at = NOW() WHERE id = $1`,
        [row.id]
      );
      failed++;
    }
  }

  return { attempted: rows.length, sent, failed };
}

module.exports = {
  buildReactivationMessage,
  generateQueue,
  listQueue,
  sendBatch,
  addToQueue,
  updateMessage,
  applyTemplate,
  MESSAGE_TEMPLATES,
  applyTemplateToContact,
};
