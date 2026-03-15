/**
 * Quote 7-day follow-up: task + optional SMS. Idempotent.
 * Run via cron/scheduled script; scans quotes where sent_at + 7d <= now and not yet accepted/declined/sent.
 */

const { pool } = require('../lib/db');
const { sendSMS } = require('@bht/integrations');
const { AUDIT_SOURCE, QUOTE_FOLLOWUP_STATE } = require('../lib/stage-constants');
const { QUOTE_FOLLOWUP_DAYS, renderQuoteFollowUpSms } = require('../lib/quote-followup-config');

const CREATED_BY = AUDIT_SOURCE.QUOTE_FOLLOWUP;
const TASK_TITLE = 'Follow up quote (7-day)';

/**
 * List quotes due for follow-up:
 * - sent_at set and sent_at + 7 days <= now
 * - not accepted/declined
 * - followup_state not in (sent, skipped)
 */
async function listQuotesDueForFollowUp(options = {}) {
  const db = options.db || pool;
  const r = await db.query(
    `SELECT q.id AS quote_id, q.opportunity_id, q.contact_id, q.account_id, q.sent_at,
            c.name AS contact_name, c.phone AS contact_phone
       FROM quotes q
       LEFT JOIN contacts c ON c.id = q.contact_id
       WHERE q.sent_at IS NOT NULL
         AND q.sent_at <= NOW() - ($1::text || ' days')::interval
         AND q.accepted_at IS NULL AND q.declined_at IS NULL
         AND (q.followup_state IS NULL OR q.followup_state = '' OR q.followup_state IN ($2, $3, $4))
       ORDER BY q.sent_at ASC`,
    [QUOTE_FOLLOWUP_DAYS, QUOTE_FOLLOWUP_STATE.NONE, QUOTE_FOLLOWUP_STATE.SCHEDULED, QUOTE_FOLLOWUP_STATE.DUE]
  );
  return r.rows;
}

/**
 * Execute follow-up for one quote: create task, optionally send SMS, update quote + opportunity, audit.
 */
async function runFollowUpForQuote(quoteRow, options = {}) {
  const db = options.db || pool;
  const dryRun = Boolean(options.dryRun);
  const sendSms = options.sendSms !== false;
  const { quote_id, opportunity_id, contact_id, contact_name, contact_phone } = quoteRow;

  const result = { quote_id, opportunity_id, task_created: null, sms_sent: false, executed_at: new Date(), result: 'ok' };

  if (!contact_id) {
    result.result = 'skipped_no_contact';
    return result;
  }

  const existingTask = await db.query(
    `SELECT id FROM tasks
     WHERE opportunity_id = $1 AND created_by = $2
     LIMIT 1`,
    [opportunity_id, CREATED_BY]
  );
  if (existingTask.rows.length > 0) {
    if (!dryRun) {
      await db.query(
        `UPDATE quotes SET followup_state = $1, followup_sent_at = COALESCE(followup_sent_at, NOW()), updated_at = NOW() WHERE id = $2`,
        [QUOTE_FOLLOWUP_STATE.SENT, quote_id]
      );
      await writeAudit(db, quote_id, opportunity_id, { ...result, task_created: existingTask.rows[0].id, result: 'idempotent_task_exists' });
    }
    result.task_created = existingTask.rows[0].id;
    result.result = 'idempotent_task_exists';
    return result;
  }

  if (!dryRun) {
    const taskRes = await db.query(
      `INSERT INTO tasks (contact_id, opportunity_id, title, status, due_at, created_by)
       VALUES ($1, $2, $3, 'open', NOW(), $4)
       RETURNING id`,
      [contact_id, opportunity_id, TASK_TITLE, CREATED_BY]
    );
    result.task_created = taskRes.rows[0]?.id || null;
  } else {
    result.task_created = 'dry_run';
  }

  if (sendSms && contact_phone && String(contact_phone).trim()) {
    try {
      if (!dryRun) {
        const message = renderQuoteFollowUpSms(contact_name);
        await sendSMS(contact_phone, message);
        result.sms_sent = true;
      } else {
        result.sms_sent = 'dry_run';
      }
    } catch (e) {
      result.sms_sent = false;
      result.sms_error = e?.message || String(e);
      result.result = 'task_created_sms_failed';
    }
  }

  if (!dryRun) {
    await db.query(
      `UPDATE quotes SET followup_state = $1, followup_sent_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [QUOTE_FOLLOWUP_STATE.SENT, quote_id]
    );
    if (opportunity_id) {
      await db.query(
        `UPDATE opportunities SET next_action_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [opportunity_id]
      );
    }
    await writeAudit(db, quote_id, opportunity_id, result);
  }

  return result;
}

async function writeAudit(db, quoteId, opportunityId, payload) {
  const pl = typeof payload === 'object' && payload !== null ? JSON.stringify(payload) : String(payload);
  await db.query(
    `INSERT INTO automation_audit_log (event_type, entity_type, entity_id, source, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    ['quote_followup_executed', 'quote', quoteId, CREATED_BY, pl]
  );
}

/**
 * Run all due quote follow-ups. Idempotent.
 */
async function runQuoteFollowUps(options = {}) {
  const db = options.db || (await pool.connect());
  const releaseDb = !options.db;
  const dryRun = Boolean(options.dryRun);
  const sendSms = options.sendSms !== false;
  const log = options.log || (() => {});

  const results = [];
  try {
    const rows = await listQuotesDueForFollowUp({ db });
    log(`Quotes due for follow-up: ${rows.length}`);

    for (const row of rows) {
      try {
        const r = await runFollowUpForQuote(row, { db, dryRun, sendSms });
        results.push(r);
        log(`Quote ${row.quote_id}: ${r.result} task=${r.task_created} sms=${r.sms_sent}`);
      } catch (e) {
        log(`Quote ${row.quote_id} error: ${e?.message || e}`);
        results.push({
          quote_id: row.quote_id,
          opportunity_id: row.opportunity_id,
          task_created: null,
          sms_sent: false,
          result: 'error',
          error: e?.message || String(e),
        });
      }
    }

    return { processed: results.length, results };
  } finally {
    if (releaseDb) db.release();
  }
}

module.exports = {
  listQuotesDueForFollowUp,
  runFollowUpForQuote,
  runQuoteFollowUps,
  CREATED_BY,
  TASK_TITLE,
};
