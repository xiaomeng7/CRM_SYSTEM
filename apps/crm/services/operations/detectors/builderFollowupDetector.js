/**
 * Builder Follow-up Detector (PR8B).
 * Scans b2b_prospects (prospect_type=builder); writes builder_followup operational_events.
 * No SMS, email, tasks, or auto-execution.
 */

const { pool } = require('../../../lib/db');
const { PROSPECT_TYPE_BUILDER, BUILDER_ENTITY_TYPE } = require('../../builder/builderProspectConstants');
const { upsertOperationalEvent } = require('../upsertOperationalEvent');
const { closeStaleDetectorEvents } = require('../closeResolvedEvents');

const EVENT_TYPE = 'builder_followup';
const SOURCE = 'builder_followup_detector';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const EXCLUDED_STAGES = new Set(['working_together', 'inactive', 'not_fit']);

function eventKeyForProspect(prospectId) {
  return `builder_followup:prospect:${prospectId}`;
}

function daysBetween(earlier, later) {
  const a = new Date(earlier);
  const b = later instanceof Date ? later : new Date(later);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / MS_PER_DAY));
}

function buildPayload(prospect, match) {
  return {
    prospect_id: prospect.id,
    company_name: prospect.company_name || null,
    website: prospect.website || null,
    suburb: prospect.suburb || null,
    builder_type: prospect.builder_type || null,
    project_focus: prospect.project_focus || null,
    fit_priority: prospect.fit_priority || null,
    relationship_stage: prospect.relationship_stage || null,
    next_followup_at: prospect.next_followup_at || null,
    last_contacted_at: prospect.last_contacted_at || null,
    overdue_days: match.overdue_days ?? null,
    reason: match.reason,
  };
}

function buildSummary(prospect, match) {
  const lines = [match.reason.replace(/_/g, ' ')];
  if (prospect.suburb) lines.push(prospect.suburb);
  if (match.overdue_days != null) lines.push(`${match.overdue_days} day(s) overdue`);
  if (prospect.relationship_stage) lines.push(`stage: ${prospect.relationship_stage}`);
  return lines.join('\n');
}

/**
 * Evaluate one builder prospect against follow-up rules.
 * Returns highest-priority match or null.
 *
 * @param {object} prospect — b2b_prospects row
 * @param {Date} [now]
 * @returns {object|null}
 */
function evaluateProspect(prospect, now = new Date()) {
  if (!prospect || prospect.prospect_type !== PROSPECT_TYPE_BUILDER) return null;

  const stage = prospect.relationship_stage != null
    ? String(prospect.relationship_stage).trim()
    : '';
  if (EXCLUDED_STAGES.has(stage)) return null;

  const matches = [];
  const company = prospect.company_name || 'Builder';

  // Rule A — next follow-up overdue
  if (prospect.next_followup_at) {
    const followUp = new Date(prospect.next_followup_at);
    if (!Number.isNaN(followUp.getTime()) && followUp < now) {
      const overdue_days = daysBetween(followUp, now);
      let severity;
      let attention_score;
      if (overdue_days >= 30) {
        severity = 'high';
        attention_score = 75;
      } else if (overdue_days >= 14) {
        severity = 'high';
        attention_score = 65;
      } else {
        severity = 'medium';
        attention_score = 50;
      }
      matches.push({
        reason: 'next_followup_overdue',
        severity,
        attention_score,
        overdue_days,
        title: `Builder follow-up overdue: ${company}`,
      });
    }
  }

  // Rule C — contacted but no recent activity
  if (stage === 'contacted' && prospect.last_contacted_at) {
    const lastContact = new Date(prospect.last_contacted_at);
    if (!Number.isNaN(lastContact.getTime())) {
      const daysSince = daysBetween(lastContact, now);
      if (daysSince >= 14) {
        matches.push({
          reason: 'contacted_stale',
          severity: 'high',
          attention_score: 65,
          overdue_days: daysSince,
          title: `Contacted builder needs follow-up: ${company}`,
        });
      }
    }
  }

  // Rule B — high priority discovered/qualified but no follow-up date
  if (
    prospect.fit_priority === 'high' &&
    (stage === 'discovered' || stage === 'qualified') &&
    !prospect.next_followup_at
  ) {
    matches.push({
      reason: 'high_priority_no_followup',
      severity: 'medium',
      attention_score: 45,
      overdue_days: null,
      title: `High-priority builder has no follow-up date: ${company}`,
    });
  }

  if (!matches.length) return null;

  matches.sort((a, b) => b.attention_score - a.attention_score);
  return matches[0];
}

async function scanBuilderProspects(db) {
  const r = await db.query(
    `SELECT * FROM b2b_prospects WHERE prospect_type = $1 ORDER BY created_at ASC`,
    [PROSPECT_TYPE_BUILDER]
  );
  return r.rows;
}

/**
 * @param {object} [options]
 * @param {import('pg').Pool|import('pg').PoolClient} [options.db]
 * @param {boolean} [options.dryRun]
 * @param {function} [options.log]
 * @param {function} [options.scanBuilderProspects] — inject for tests
 * @param {Date} [options.now]
 */
async function runBuilderFollowupDetector(options = {}) {
  const db = options.db || pool;
  const dryRun = Boolean(options.dryRun);
  const log = options.log || (() => {});
  const now = options.now || new Date();
  const scanFn = options.scanBuilderProspects || (() => scanBuilderProspects(db));

  const prospects = await scanFn();
  const stats = {
    scanned: prospects.length,
    matched: 0,
    upserted: 0,
    created: 0,
    updated: 0,
    closed_stale: 0,
    active_keys: [],
  };

  const activeKeys = [];

  for (const prospect of prospects) {
    const match = evaluateProspect(prospect, now);
    if (!match) continue;

    stats.matched++;
    const event_key = eventKeyForProspect(prospect.id);
    activeKeys.push(event_key);

    const eventInput = {
      event_key,
      event_type: EVENT_TYPE,
      severity: match.severity,
      attention_score: match.attention_score,
      source: SOURCE,
      entity_type: BUILDER_ENTITY_TYPE,
      entity_id: prospect.id,
      title: match.title,
      summary: buildSummary(prospect, match),
      payload: buildPayload(prospect, match),
      detected_at: now,
    };

    if (dryRun) {
      log(
        `[dry-run] ${event_key} score=${match.attention_score} reason=${match.reason} title=${match.title}`
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
      log(`Closed ${stats.closed_stale} stale builder_followup event(s)`);
    }
  } else {
    log(`[dry-run] would close stale keys not in ${activeKeys.length} active prospect(s)`);
  }

  log(
    `Builder follow-up: scanned=${stats.scanned} matched=${stats.matched} upserted=${stats.upserted} created=${stats.created} updated=${stats.updated} closed_stale=${stats.closed_stale}`
  );

  return stats;
}

module.exports = {
  runBuilderFollowupDetector,
  evaluateProspect,
  eventKeyForProspect,
  buildPayload,
  buildSummary,
  scanBuilderProspects,
  EVENT_TYPE,
  EXCLUDED_STAGES,
};
