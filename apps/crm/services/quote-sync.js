/**
 * Quote Sync — ServiceM8 quote → CRM opportunities / tasks / audit.
 * Idempotent. Does not overwrite manual Won/Lost.
 */

const { pool } = require('../lib/db');
const { OPPORTUNITY_STAGES, QUOTE_STATUS_TO_STAGE, AUDIT_SOURCE, QUOTE_FOLLOWUP_STATE } = require('../lib/stage-constants');
const { QUOTE_FOLLOWUP_DAYS } = require('../lib/quote-followup-config');
const { advanceOpportunityStage } = require('./opportunityStageAutomation');
const { runQuoteAcceptedAutomation } = require('./quoteAcceptedAutomation');

function toArray(val) {
  if (Array.isArray(val)) return val;
  if (val && val.data) return Array.isArray(val.data) ? val.data : [];
  if (val && typeof val === 'object') return [val];
  return [];
}

function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeQuoteStatus(s) {
  if (!s || typeof s !== 'string') return null;
  return s.trim().toLowerCase().replace(/\s+/g, '_');
}

function inferStatusFromPayload(raw) {
  const s = (raw.status || raw.status_name || raw.statusName || raw.state || '').trim().toLowerCase();
  if (s) return s;
  if (raw.accepted_at || raw.acceptedAt) return 'accepted';
  if (raw.declined_at || raw.declinedAt) return 'declined';
  if (raw.sent_at || raw.sentAt) return 'sent';
  return 'draft';
}

/**
 * Create follow-up task for quote_sent (idempotent: 7d window).
 */
async function createQuoteFollowUpTask(db, opportunityId, contactId, options = {}) {
  if (!contactId) return null;
  const createdBy = options.created_by || AUDIT_SOURCE.QUOTE_SYNC;
  const existing = await db.query(
    `SELECT 1 FROM tasks
     WHERE opportunity_id = $1 AND created_by IN ($2, $3)
       AND created_at >= NOW() - INTERVAL '7 days'
     LIMIT 1`,
    [opportunityId, AUDIT_SOURCE.QUOTE_SYNC, AUDIT_SOURCE.QUOTE_WEBHOOK]
  );
  if (existing.rows.length > 0) return null;

  const r = await db.query(
    `INSERT INTO tasks (contact_id, opportunity_id, title, status, due_at, created_by)
     VALUES ($1, $2, $3, 'open', NOW() + INTERVAL '7 days', $4)
     RETURNING id`,
    [contactId, opportunityId, 'Follow up quote', createdBy]
  );
  return r.rows[0]?.id || null;
}

/**
 * Write automation_audit_log.
 */
async function writeAuditLog(db, eventType, entityType, entityId, payload = {}) {
  await db.query(
    `INSERT INTO automation_audit_log (event_type, entity_type, entity_id, source, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [eventType, entityType || null, entityId || null, AUDIT_SOURCE.QUOTE_SYNC, JSON.stringify(payload)]
  );
}

/**
 * Upsert a single quote and apply opportunity linkage.
 */
async function upsertQuote(db, raw, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const uuid = raw.uuid || raw.UUID;
  if (!uuid) return { skipped: true, reason: 'no uuid' };

  const jobUuid = raw.job_uuid || raw.jobUUID || raw.job;
  const jobUuidToId = await db.query(
    `SELECT servicem8_job_uuid, id FROM jobs WHERE servicem8_job_uuid IS NOT NULL`
  ).then((r) => {
    const m = {};
    for (const row of r.rows) m[row.servicem8_job_uuid] = row.id;
    return m;
  });
  const jobId = jobUuid ? jobUuidToId[jobUuid] : null;

  const oppByJob = jobId
    ? await db.query(
        `SELECT id, contact_id FROM opportunities WHERE service_m8_job_id = $1`,
        [jobUuid]
      ).then((r) => r.rows[0])
    : null;

  const opportunityId = oppByJob?.id || null;
  const contactId = oppByJob?.contact_id || null;

  const accountId = raw.company_uuid || raw.companyUUID
    ? await db.query(
        `SELECT entity_id FROM external_links
         WHERE system = 'servicem8' AND external_entity_type = 'company' AND external_id = $1`,
        [raw.company_uuid || raw.companyUUID]
      ).then((r) => r.rows[0]?.entity_id)
    : null;

  const status = inferStatusFromPayload(raw);
  const normStatus = normalizeQuoteStatus(status) || status;
  const amount = raw.amount != null ? parseFloat(raw.amount) : (raw.total != null ? parseFloat(raw.total) : null);
  const sentAt = parseDate(raw.sent_at || raw.sentAt || raw.date_sent);
  const acceptedAt = parseDate(raw.accepted_at || raw.acceptedAt);
  const declinedAt = parseDate(raw.declined_at || raw.declinedAt);
  const expiresAt = parseDate(raw.expires_at || raw.expiresAt) ? parseDate(raw.expires_at || raw.expiresAt).toISOString().slice(0, 10) : null;
  const rawPayload = options.storeRaw !== false ? raw : null;

  const existing = await db.query(
    `SELECT id, status, opportunity_id FROM quotes WHERE servicem8_quote_uuid = $1`,
    [uuid]
  ).then((r) => r.rows[0]);

  const followupDueAt = sentAt && !acceptedAt && !declinedAt ? new Date(sentAt.getTime() + QUOTE_FOLLOWUP_DAYS * 24 * 60 * 60 * 1000) : null;
  const followupStateNew = sentAt && !acceptedAt && !declinedAt ? QUOTE_FOLLOWUP_STATE.SCHEDULED : null;

  if (!dryRun) {
    if (existing) {
      await db.query(
        `UPDATE quotes SET
          opportunity_id = COALESCE($1, opportunity_id),
          account_id = COALESCE($2, account_id),
          contact_id = COALESCE($3, contact_id),
          job_id = COALESCE($4, job_id),
          amount = COALESCE($5, amount),
          status = COALESCE(NULLIF(TRIM($6), ''), status),
          sent_at = COALESCE($7, sent_at),
          accepted_at = COALESCE($8, accepted_at),
          declined_at = COALESCE($9, declined_at),
          expires_at = COALESCE($10, expires_at),
          followup_due_at = CASE WHEN $7 IS NOT NULL AND $8 IS NULL AND $9 IS NULL AND (followup_state IS NULL OR followup_state NOT IN ($13, $14)) THEN $15 ELSE followup_due_at END,
          followup_state = CASE WHEN $7 IS NOT NULL AND $8 IS NULL AND $9 IS NULL AND (followup_state IS NULL OR followup_state NOT IN ($13, $14)) THEN COALESCE(followup_state, $16) ELSE followup_state END,
          updated_at = NOW(),
          last_synced_at = NOW(),
          raw_payload_json = COALESCE($11::jsonb, raw_payload_json)
         WHERE servicem8_quote_uuid = $12`,
        [opportunityId, accountId, contactId, jobId, amount, normStatus, sentAt, acceptedAt, declinedAt, expiresAt, rawPayload, uuid, QUOTE_FOLLOWUP_STATE.SENT, QUOTE_FOLLOWUP_STATE.SKIPPED, followupDueAt, followupStateNew]
      );
    } else {
      await db.query(
        `INSERT INTO quotes (servicem8_quote_uuid, opportunity_id, account_id, contact_id, job_id, amount, status, sent_at, accepted_at, declined_at, expires_at, followup_due_at, followup_state, last_synced_at, raw_payload_json, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), $14::jsonb, $15)`,
        [uuid, opportunityId, accountId, contactId, jobId, amount, normStatus, sentAt, acceptedAt, declinedAt, expiresAt, followupDueAt, followupStateNew, rawPayload, 'quote-sync']
      );
    }
  }

  const targetStage = QUOTE_STATUS_TO_STAGE[normStatus] || QUOTE_STATUS_TO_STAGE[status];
  const oppId = opportunityId || existing?.opportunity_id;

  if (targetStage && oppId) {
    const prevStatus = existing?.status;
    const isNewEvent = !existing || (prevStatus !== normStatus && prevStatus !== status);

    if (isNewEvent) {
      const eventType = targetStage === OPPORTUNITY_STAGES.QUOTED ? 'quote_sent' : targetStage === OPPORTUNITY_STAGES.WON ? 'quote_accepted' : targetStage === OPPORTUNITY_STAGES.LOST ? 'quote_declined' : null;
      if (eventType) {
        await advanceOpportunityStage(oppId, eventType, {
          db,
          dryRun,
          created_by: AUDIT_SOURCE.QUOTE_SYNC,
          lost_reason: (raw.decline_reason || raw.declined_reason || raw.lost_reason || '').trim() || undefined,
          ...options,
        });
      }

      if (targetStage === OPPORTUNITY_STAGES.QUOTED && !dryRun) {
        await createQuoteFollowUpTask(db, oppId, contactId, options);
      }

      if ([OPPORTUNITY_STAGES.WON, OPPORTUNITY_STAGES.LOST].includes(targetStage) && !dryRun) {
        await writeAuditLog(db, `quote_${targetStage}`, 'opportunity', oppId, {
          quote_uuid: uuid,
          previous_status: prevStatus,
          new_status: normStatus,
          raw: { amount, sentAt, acceptedAt, declinedAt },
        });
        if (targetStage === OPPORTUNITY_STAGES.WON) {
          await runQuoteAcceptedAutomation(oppId, { db, dryRun, contactId, ...options });
        }
      }
    }
  }

  return { upserted: true, opportunity_updated: !!targetStage && !!oppId };
}

/**
 * Sync quotes from ServiceM8 pull. Idempotent.
 */
async function syncQuotesFromServiceM8(options = {}) {
  const { ServiceM8Client } = require('@bht/integrations');
  const client = new ServiceM8Client();
  const db = options.db || await pool.connect();
  const releaseDb = !options.db;
  const dryRun = Boolean(options.dryRun);
  const stats = { quotes_fetched: 0, quotes_upserted: 0, opportunities_updated: 0, errors: 0 };

  try {
    let raw;
    try {
      raw = await client.getJobQuotes(options.since ? buildSinceFilter(options.since) : '');
    } catch (e) {
      if (options.log) options.log('getJobQuotes failed: ' + (e?.message || e));
      return stats;
    }

    const list = toArray(raw);
    stats.quotes_fetched = list.length;
    if (options.log) options.log(`Quotes: fetched ${list.length}`);

    for (const item of list) {
      try {
        const r = await upsertQuote(db, item, { ...options, db });
        if (r.upserted) stats.quotes_upserted++;
        if (r.opportunity_updated) stats.opportunities_updated++;
      } catch (e) {
        stats.errors++;
        if (options.onError) options.onError(e, { uuid: item.uuid || item.UUID });
      }
    }

    return stats;
  } finally {
    if (releaseDb) db.release();
  }
}

function buildSinceFilter(since) {
  if (!since) return '';
  const d = typeof since === 'string' ? since.slice(0, 10) : new Date(since).toISOString().slice(0, 10);
  return `last_modified_date gt '${d}'`;
}

/**
 * Process a single quote event (webhook-style). Idempotent.
 */
async function processQuoteEvent(db, payload, options = {}) {
  const { event, quote_uuid, job_uuid, status } = payload;
  const dryRun = Boolean(options.dryRun);

  const normStatus = normalizeQuoteStatus(status || event) || inferStatusFromPayload(payload);
  const targetStage = QUOTE_STATUS_TO_STAGE[normStatus];

  if (!targetStage) {
    if (options.log) options.log(`Unknown quote event: ${event || status}`);
    return { applied: false, reason: 'unknown_status' };
  }

  let opportunityId = null;
  let contactId = null;

  if (job_uuid) {
    const row = await db.query(
      `SELECT o.id, o.contact_id FROM opportunities o WHERE o.service_m8_job_id = $1`,
      [job_uuid]
    ).then((r) => r.rows[0]);
    if (row) {
      opportunityId = row.id;
      contactId = row.contact_id;
    }
  }

  if (quote_uuid) {
    const q = await db.query(
      `SELECT opportunity_id FROM quotes WHERE servicem8_quote_uuid = $1`,
      [quote_uuid]
    ).then((r) => r.rows[0]);
    if (q?.opportunity_id) opportunityId = q.opportunity_id;
  }

  if (!opportunityId) {
    if (options.log) options.log('No opportunity found for quote event');
    return { applied: false, reason: 'no_opportunity' };
  }

  const eventType = targetStage === OPPORTUNITY_STAGES.QUOTED ? 'quote_sent' : targetStage === OPPORTUNITY_STAGES.WON ? 'quote_accepted' : 'quote_declined';
  const result = await advanceOpportunityStage(opportunityId, eventType, {
    db,
    dryRun,
    created_by: AUDIT_SOURCE.QUOTE_WEBHOOK,
    lost_reason: (payload.decline_reason || payload.lost_reason || '').trim() || undefined,
    ...options,
  });

  if (targetStage === OPPORTUNITY_STAGES.QUOTED && result.applied && !dryRun) {
    await createQuoteFollowUpTask(db, opportunityId, contactId, { ...options, created_by: AUDIT_SOURCE.QUOTE_WEBHOOK });
  }

  if ([OPPORTUNITY_STAGES.WON, OPPORTUNITY_STAGES.LOST].includes(targetStage) && !dryRun) {
    await writeAuditLog(db, `quote_${targetStage}`, 'opportunity', opportunityId, {
      source: 'webhook',
      quote_uuid,
      job_uuid,
      status: normStatus,
      payload,
    });
    if (targetStage === OPPORTUNITY_STAGES.WON) {
      await runQuoteAcceptedAutomation(opportunityId, { db, dryRun, contactId, ...options });
    }
  }

  return { applied: result.applied, opportunity_id: opportunityId };
}

module.exports = {
  syncQuotesFromServiceM8,
  processQuoteEvent,
  upsertQuote,
  writeAuditLog,
};
