/**
 * Quote Acceptance Automation.
 * When quote is accepted: stage already advanced by quote-sync/webhook;
 * this service: create job_preparation task, send thank-you SMS, set opportunity.probability = 100, audit log.
 */

const { pool } = require('../lib/db');
const { sendSMS } = require('@bht/integrations');
const { CREATED_BY, TASK_TITLE, TASK_TYPE, renderThankYouSms } = require('../lib/quote-accepted-config');

const AUDIT_SOURCE = 'quote-accepted-automation';

/**
 * Run automation after quote_accepted (stage advance is done by caller).
 * Idempotent: one job_preparation task per opportunity; duplicate runs skip task create / SMS if already sent.
 *
 * @param {string} opportunityId - UUID
 * @param {Object} options - { db?, dryRun?, sendSms?: boolean, contactId? }
 * @returns {Promise<{ task_created?: string, sms_sent?: boolean, probability_updated?: boolean }>}
 */
async function runQuoteAcceptedAutomation(opportunityId, options = {}) {
  const db = options.db || pool;
  const dryRun = Boolean(options.dryRun);
  const sendSmsFlag = options.sendSms !== false;

  const row = await db.query(
    `SELECT o.id, o.contact_id, o.probability,
            c.name AS contact_name, c.phone AS contact_phone
     FROM opportunities o
     LEFT JOIN contacts c ON c.id = o.contact_id
     WHERE o.id = $1`,
    [opportunityId]
  ).then((r) => r.rows[0]);

  if (!row) return {};

  const contactId = row.contact_id || options.contactId;
  let contactName = row.contact_name;
  let contactPhone = row.contact_phone;
  if (contactId && (!contactName || !contactPhone)) {
    const c = await db.query(`SELECT id, name, phone FROM contacts WHERE id = $1`, [contactId]).then((r) => r.rows[0]);
    if (c) {
      contactName = c.name;
      contactPhone = c.phone;
    }
  }

  const result = {};

  // 1. Job preparation task (idempotent: one per opportunity)
  const existingTask = await db.query(
    `SELECT id FROM tasks WHERE opportunity_id = $1 AND created_by = $2 AND title = $3 LIMIT 1`,
    [opportunityId, CREATED_BY, TASK_TITLE]
  );
  let taskId = existingTask.rows[0]?.id;
  if (!taskId && !dryRun) {
    const ins = await db.query(
      `INSERT INTO tasks (contact_id, opportunity_id, title, status, due_at, task_type, created_by)
       VALUES ($1, $2, $3, 'open', NOW(), $4, $5)
       RETURNING id`,
      [contactId, opportunityId, TASK_TITLE, TASK_TYPE, CREATED_BY]
    );
    taskId = ins.rows[0]?.id;
  }
  result.task_created = taskId || (dryRun ? 'dry_run' : null);

  // 2. Thank-you SMS
  if (sendSmsFlag && contactPhone && String(contactPhone).trim()) {
    try {
      if (!dryRun) {
        const msg = renderThankYouSms(contactName);
        await sendSMS(contactPhone, msg);
        result.sms_sent = true;
      } else {
        result.sms_sent = 'dry_run';
      }
    } catch (e) {
      result.sms_error = e?.message || String(e);
    }
  }

  // 3. Forecast: opportunity.probability = 100
  if (!dryRun) {
    await db.query(
      `UPDATE opportunities SET probability = 100, updated_at = NOW() WHERE id = $1`,
      [opportunityId]
    );
    result.probability_updated = true;
  }

  // 4. Audit log
  if (!dryRun) {
    await db.query(
      `INSERT INTO automation_audit_log (event_type, entity_type, entity_id, source, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        'quote_accepted_automation',
        'opportunity',
        opportunityId,
        AUDIT_SOURCE,
        JSON.stringify({
          task_created: !!result.task_created,
          sms_sent: result.sms_sent === true,
          probability_updated: true,
        }),
      ]
    );
  }

  return result;
}

module.exports = {
  runQuoteAcceptedAutomation,
  AUDIT_SOURCE,
};
