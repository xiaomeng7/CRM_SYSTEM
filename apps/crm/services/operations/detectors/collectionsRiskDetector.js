/**
 * Collections Risk Detector (PR7B).
 * Scans invoice collection risk via scanOverdueInvoices(); writes operational_events.
 * No SMS, tasks, or auto-execution.
 */

const { pool } = require('../../../lib/db');
const { scanOverdueInvoices } = require('../../invoiceOverdueAutomation');
const { OVERDUE_LEVEL } = require('../../../lib/invoice-overdue-config');
const { upsertOperationalEvent } = require('../upsertOperationalEvent');
const { closeStaleDetectorEvents } = require('../closeResolvedEvents');

const EVENT_TYPE = 'collections_risk';
const SOURCE = 'collections_risk_detector';
const BASE_SCORE = 30;
const MAX_SCORE = 100;
const AMOUNT_THRESHOLD = 5000;

function eventKeyForInvoice(invoiceId) {
  return `collections_risk:invoice:${invoiceId}`;
}

function fmtMoney(amount) {
  const x = Number(amount);
  if (!Number.isFinite(x)) return '$0';
  return (
    '$' +
    x.toLocaleString('en-AU', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  );
}

function invoiceRef(row) {
  const num = row.invoice_number && String(row.invoice_number).trim();
  if (num) return num;
  return `INV-${String(row.invoice_id).slice(0, 8)}`;
}

/**
 * @param {object} row — scanOverdueInvoices row + enrichments
 * @returns {number} 0–100
 */
function computeCollectionsAttentionScore(row) {
  let score = BASE_SCORE;
  const amount = Number(row.amount) || 0;
  const days = Number(row.days_overdue) || 0;
  const overdueLevel = String(row.overdue_level || 'none').toLowerCase();
  const paymentRisk = String(row.payment_risk || '').toLowerCase();

  if (amount >= AMOUNT_THRESHOLD) score += 20;
  if (days >= 14) score += 20;
  if (days >= 30) score += 30;
  if (paymentRisk === 'high') score += 20;
  if (overdueLevel === OVERDUE_LEVEL.DAYS_14) score += 20;

  return Math.min(MAX_SCORE, Math.max(0, Math.round(score)));
}

function severityFromAttention(attentionScore) {
  if (attentionScore >= 80) return 'critical';
  if (attentionScore >= 60) return 'high';
  if (attentionScore >= 40) return 'medium';
  return 'low';
}

function buildTitle(row) {
  const customer = row.customer_name || row.contact_name || 'Customer';
  return `${customer} overdue ${fmtMoney(row.amount)}`;
}

function buildSummary(row) {
  const lines = [
    `Invoice ${invoiceRef(row)}`,
    `${row.days_overdue} days overdue`,
  ];
  const pr = row.payment_risk && String(row.payment_risk).trim();
  if (pr) lines.push(`payment risk ${pr}`);
  return lines.join('\n');
}

function buildPayload(row) {
  return {
    invoice_id: row.invoice_id,
    invoice_number: row.invoice_number || null,
    customer: row.customer_name || row.contact_name || null,
    amount: Number(row.amount) || 0,
    days_overdue: Number(row.days_overdue) || 0,
    payment_risk: row.payment_risk || null,
    overdue_level: row.overdue_level || 'none',
  };
}

async function enrichOverdueRows(rows, db) {
  if (!rows.length) return [];

  const contactIds = [...new Set(rows.map((r) => r.contact_id).filter(Boolean))];
  const accountIds = [...new Set(rows.map((r) => r.account_id).filter(Boolean))];

  const paymentRiskByContact = {};
  const accountNameById = {};

  if (contactIds.length) {
    const cr = await db.query(
      `SELECT c.id, c.payment_risk, a.name AS account_name
       FROM contacts c
       LEFT JOIN accounts a ON a.id = c.account_id
       WHERE c.id = ANY($1::uuid[])`,
      [contactIds]
    );
    for (const row of cr.rows) {
      paymentRiskByContact[row.id] = row.payment_risk || null;
      if (row.account_name) accountNameById[row.id] = row.account_name;
    }
  }

  if (accountIds.length) {
    const ar = await db.query(`SELECT id, name FROM accounts WHERE id = ANY($1::uuid[])`, [accountIds]);
    for (const row of ar.rows) {
      accountNameById[row.id] = row.name;
    }
  }

  return rows.map((row) => ({
    ...row,
    payment_risk: row.contact_id ? paymentRiskByContact[row.contact_id] || null : null,
    customer_name:
      (row.account_id && accountNameById[row.account_id]) ||
      (row.contact_id && accountNameById[row.contact_id]) ||
      row.contact_name ||
      null,
  }));
}

/**
 * @param {object} [options]
 * @param {import('pg').Pool|import('pg').PoolClient} [options.db]
 * @param {boolean} [options.dryRun]
 * @param {function} [options.log]
 * @param {function} [options.scanOverdueInvoices] — inject for tests
 */
async function runCollectionsRiskDetector(options = {}) {
  const db = options.db || pool;
  const dryRun = Boolean(options.dryRun);
  const log = options.log || (() => {});
  const scanFn = options.scanOverdueInvoices || scanOverdueInvoices;

  const rawRows = await scanFn({ db });
  const rows = await enrichOverdueRows(rawRows, db);

  const stats = {
    scanned: rows.length,
    upserted: 0,
    created: 0,
    updated: 0,
    closed_stale: 0,
    active_keys: [],
  };

  const activeKeys = [];

  for (const row of rows) {
    const event_key = eventKeyForInvoice(row.invoice_id);
    activeKeys.push(event_key);

    const attention_score = computeCollectionsAttentionScore(row);
    const severity = severityFromAttention(attention_score);

    const eventInput = {
      event_key,
      event_type: EVENT_TYPE,
      severity,
      attention_score,
      source: SOURCE,
      entity_type: 'invoice',
      entity_id: row.invoice_id,
      title: buildTitle(row),
      summary: buildSummary(row),
      payload: buildPayload(row),
      detected_at: new Date(),
    };

    if (dryRun) {
      log(
        `[dry-run] ${event_key} score=${attention_score} severity=${severity} title=${eventInput.title}`
      );
      stats.upserted++;
      continue;
    }

    const result = await upsertOperationalEvent(eventInput, { db });
    stats.upserted++;
    if (result.created) stats.created++;
    if (result.updated) stats.updated++;
  }

  stats.active_keys = activeKeys;

  if (!dryRun) {
    const closed = await closeStaleDetectorEvents(
      { event_type: EVENT_TYPE, active_event_keys: activeKeys },
      { db }
    );
    stats.closed_stale = closed.closed_count || 0;
    stats.stale_keys = closed.stale_keys || [];
    if (stats.closed_stale) {
      log(`Closed ${stats.closed_stale} stale collections_risk event(s)`);
    }
  } else {
    log(`[dry-run] would close stale keys not in ${activeKeys.length} active invoice(s)`);
  }

  log(
    `Collections risk: scanned=${stats.scanned} upserted=${stats.upserted} created=${stats.created} updated=${stats.updated} closed_stale=${stats.closed_stale}`
  );

  return stats;
}

module.exports = {
  runCollectionsRiskDetector,
  computeCollectionsAttentionScore,
  severityFromAttention,
  eventKeyForInvoice,
  buildTitle,
  buildSummary,
  buildPayload,
  EVENT_TYPE,
  BASE_SCORE,
  MAX_SCORE,
};
