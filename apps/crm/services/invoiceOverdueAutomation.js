/**
 * Invoice Overdue Automation
 * Daily scan: unpaid invoices past due_date → level 3 / 7 / 14 reminders, tasks, SMS, payment_risk.
 */

const { pool } = require('../lib/db');
const { sendSMS } = require('@bht/integrations');
const {
  OVERDUE_LEVEL,
  CREATED_BY,
  TASK_TITLE_3,
  TASK_TITLE_7,
  TASK_TITLE_14,
  renderSms,
} = require('../lib/invoice-overdue-config');

const AUDIT_SOURCE = 'invoice-overdue';

/**
 * Scan unpaid invoices with due_date < today, return rows with days_overdue and current overdue_level.
 */
async function scanOverdueInvoices(options = {}) {
  const db = options.db || pool;
  const rows = await db.query(
    `SELECT i.id AS invoice_id, i.account_id, i.invoice_number, i.amount, i.due_date,
            COALESCE(i.overdue_level, 'none') AS overdue_level,
            (CURRENT_DATE - i.due_date)::int AS days_overdue,
            c.id AS contact_id, c.name AS contact_name, c.phone AS contact_phone
     FROM invoices i
     LEFT JOIN LATERAL (
       SELECT id, name, phone FROM contacts WHERE account_id = i.account_id AND (phone IS NOT NULL AND TRIM(phone) <> '') ORDER BY created_at ASC LIMIT 1
     ) c ON true
     WHERE LOWER(TRIM(COALESCE(i.status, ''))) != 'paid'
       AND i.due_date IS NOT NULL
       AND i.due_date < CURRENT_DATE
     ORDER BY i.due_date ASC`
  );
  return rows.rows;
}

/**
 * Determine which level to trigger for this row (3, 7, or 14). Returns null if none.
 */
function getLevelToTrigger(row) {
  const days = row.days_overdue;
  const level = (row.overdue_level || 'none').toLowerCase();
  if (days >= 14 && level === OVERDUE_LEVEL.DAYS_7) return OVERDUE_LEVEL.DAYS_14;
  if (days >= 7 && level === OVERDUE_LEVEL.DAYS_3) return OVERDUE_LEVEL.DAYS_7;
  if (days >= 3 && level === OVERDUE_LEVEL.NONE) return OVERDUE_LEVEL.DAYS_3;
  return null;
}

/**
 * Execute actions for one level (task, optional SMS, update invoice, contact payment_risk, audit).
 */
async function runLevelForInvoice(row, targetLevel, options = {}) {
  const db = options.db || pool;
  const dryRun = Boolean(options.dryRun);
  const sendSms = options.sendSms !== false;
  const { invoice_id, account_id, contact_id, contact_name, contact_phone, invoice_number } = row;

  const result = { invoice_id, level: targetLevel, task_created: null, sms_sent: false };

  let contactId = contact_id;
  let contactName = contact_name;
  let contactPhone = contact_phone;
  if (!contactId && account_id) {
    const first = await getFirstContactForAccount(db, account_id);
    if (first) {
      contactId = first;
      const c = await db.query(`SELECT id, name, phone FROM contacts WHERE id = $1`, [first]).then((r) => r.rows[0]);
      if (c) {
        contactName = c.name;
        contactPhone = c.phone;
      }
    }
  }

  if (!contactId) {
    if (!dryRun) {
      await db.query(
        `UPDATE invoices SET overdue_level = $1, last_reminder_sent_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [targetLevel, invoice_id]
      );
      await writeAudit(db, invoice_id, 'level_triggered', targetLevel, { task_created: false, sms_sent: false, reason: 'no_contact' });
    }
    return { ...result, task_created: null, sms_sent: false };
  }

  const contact = { id: contactId, name: contactName, phone: contactPhone };

  const taskTitle = targetLevel === OVERDUE_LEVEL.DAYS_3 ? TASK_TITLE_3 : targetLevel === OVERDUE_LEVEL.DAYS_7 ? TASK_TITLE_7 : TASK_TITLE_14;

  const existingTask = await db.query(
    `SELECT id FROM tasks WHERE contact_id = $1 AND created_by = $2 AND title = $3 LIMIT 1`,
    [contactId, CREATED_BY, taskTitle]
  );
  let taskId = existingTask.rows[0]?.id;
  if (!taskId && !dryRun) {
    const ins = await db.query(
      `INSERT INTO tasks (contact_id, title, status, due_at, created_by) VALUES ($1, $2, 'open', NOW(), $3) RETURNING id`,
      [contactId, taskTitle, CREATED_BY]
    );
    taskId = ins.rows[0]?.id;
  }
  result.task_created = taskId || (dryRun ? 'dry_run' : null);

  if ((targetLevel === OVERDUE_LEVEL.DAYS_3 || targetLevel === OVERDUE_LEVEL.DAYS_7 || targetLevel === OVERDUE_LEVEL.DAYS_14) && sendSms && contact?.phone && String(contact.phone).trim()) {
    try {
      if (!dryRun) {
        const msg = (options.customMessage && String(options.customMessage).trim()) || renderSms(targetLevel, contact.name, invoice_number);
        await sendSMS(contact.phone, msg);
        result.sms_sent = true;
      } else {
        result.sms_sent = 'dry_run';
      }
    } catch (e) {
      result.sms_error = e?.message || String(e);
    }
  }

  if (!dryRun) {
    await db.query(
      `UPDATE invoices SET overdue_level = $1, last_reminder_sent_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [targetLevel, invoice_id]
    );
    if (targetLevel === OVERDUE_LEVEL.DAYS_14) {
      await db.query(
        `UPDATE contacts SET payment_risk = 'high', updated_at = NOW() WHERE id = $1`,
        [contactId]
      );
    } else if (targetLevel === OVERDUE_LEVEL.DAYS_7) {
      await db.query(
        `UPDATE contacts SET payment_risk = COALESCE(NULLIF(payment_risk, 'high'), 'medium'), updated_at = NOW() WHERE id = $1`,
        [contactId]
      );
    }
    await writeAudit(db, invoice_id, 'level_triggered', targetLevel, { task_created: taskId, sms_sent: result.sms_sent === true });
  }

  return result;
}

async function getFirstContactForAccount(db, accountId) {
  if (!accountId) return null;
  const r = await db.query(
    `SELECT id FROM contacts WHERE account_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [accountId]
  );
  return r.rows[0]?.id || null;
}

async function writeAudit(db, invoiceId, action, level, payload = {}) {
  await db.query(
    `INSERT INTO automation_audit_log (event_type, entity_type, entity_id, source, payload, action_type, trigger_event, executed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [
      'invoice_overdue_automation',
      'invoice',
      invoiceId,
      AUDIT_SOURCE,
      JSON.stringify({ action, level, ...payload }),
      action,
      level,
    ]
  );
}

/**
 * Run full overdue scan and trigger level 3 / 7 / 14 per invoice. Idempotent per level.
 */
async function runOverdueScan(options = {}) {
  const db = options.db || (await pool.connect());
  const releaseDb = !options.db;
  const dryRun = Boolean(options.dryRun);
  const sendSms = options.sendSms !== false;
  const log = options.log || (() => {});

  const results = [];
  try {
    const rows = await scanOverdueInvoices({ db });
    log(`Overdue invoices (unpaid, past due): ${rows.length}`);

    for (const row of rows) {
      const targetLevel = getLevelToTrigger(row);
      if (!targetLevel) continue;

      try {
        const r = await runLevelForInvoice(row, targetLevel, { db, dryRun, sendSms });
        results.push(r);
        log(`Invoice ${row.invoice_id} level=${targetLevel} task=${r.task_created} sms=${r.sms_sent}`);
      } catch (e) {
        log(`Invoice ${row.invoice_id} error: ${e?.message || e}`);
        results.push({ invoice_id: row.invoice_id, level: targetLevel, error: e?.message || String(e) });
      }
    }

    return { processed: results.length, results };
  } finally {
    if (releaseDb) db.release();
  }
}

module.exports = {
  scanOverdueInvoices,
  getLevelToTrigger,
  runLevelForInvoice,
  runOverdueScan,
  CREATED_BY,
};
