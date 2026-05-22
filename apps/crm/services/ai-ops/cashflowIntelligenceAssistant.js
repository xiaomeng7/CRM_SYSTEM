/**
 * Cashflow Intelligence Assistant — persist daily snapshots (rules only, no LLM).
 */

const { pool } = require('../../lib/db');
const automationSettings = require('../automationSettings');
const { collectCashflowFacts, getAdelaideYmd } = require('./cashflowFacts');
const { buildRuleInsights } = require('./ruleRecommendations');

const OPERATION_TYPE = 'cashflow_intel';
const PROMPT_VERSION = 'rules-v1';
const ADVISORY_LOCK_ID = 8632741;

/**
 * @param {object} [options]
 * @param {boolean} [options.force=false] — replace existing snapshot for snapshot_date
 * @param {boolean} [options.dryRun=false] — compute + audit run; do not write financial_snapshots
 * @param {string} [options.snapshotDate] — YYYY-MM-DD Adelaide
 * @param {function} [options.log]
 */
async function runCashflowIntelligence(options = {}) {
  const log = options.log || (() => {});
  const force = Boolean(options.force || process.env.CASHFLOW_INTEL_FORCE === '1');
  const dryRun = Boolean(options.dryRun || process.env.CASHFLOW_INTEL_DRY_RUN === '1');
  const snapshotDate = options.snapshotDate || getAdelaideYmd();

  const enabled = await automationSettings.getEnabled('cashflow_intel_enabled');
  if (!enabled) {
    const runId = await insertRun({
      status: 'skipped',
      details: { reason: 'disabled', snapshot_date: snapshotDate, dry_run: dryRun },
    });
    log('[cashflow-intel] skipped: cashflow_intel_enabled=false');
    return buildResult({
      run_id: runId,
      status: 'skipped',
      snapshot_id: null,
      degraded: false,
      reason: 'disabled',
    });
  }

  // Facts use pool (parallel queries); lock + snapshot write use a short transaction.
  const facts = await collectCashflowFacts({ snapshotDate });
  const insights = buildRuleInsights(facts);

  const client = await pool.connect();
  let runId = null;

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [ADVISORY_LOCK_ID]);

    const existing = await client.query(
      `SELECT id FROM financial_snapshots WHERE snapshot_date = $1::date`,
      [snapshotDate]
    );
    const existingSnapshotId = existing.rows[0]?.id || null;

    if (existingSnapshotId && !force) {
      runId = await insertRun(
        {
          status: 'skipped',
          details: {
            reason: 'snapshot_exists',
            snapshot_date: snapshotDate,
            existing_snapshot_id: existingSnapshotId,
            dry_run: dryRun,
          },
        },
        client
      );
      await client.query('COMMIT');
      log('[cashflow-intel] skipped: snapshot already exists for %s (use --force to replace)', snapshotDate);
      return buildResult({
        run_id: runId,
        status: 'skipped',
        snapshot_id: existingSnapshotId,
        degraded: false,
        reason: 'snapshot_exists',
        facts,
        insights,
      });
    }

    runId = await insertRun(
      {
        status: 'running',
        details: { snapshot_date: snapshotDate, force, dry_run: dryRun },
      },
      client
    );

    if (dryRun) {
      await finishRun(client, runId, {
        status: 'completed',
        model_provider: 'none',
        model_name: null,
        prompt_version: PROMPT_VERSION,
        details: {
          snapshot_date: snapshotDate,
          dry_run: true,
          force,
          would_replace: Boolean(existingSnapshotId),
          degraded: false,
        },
      });
      await client.query('COMMIT');
      log('[cashflow-intel] dry-run completed for %s (no snapshot written)', snapshotDate);
      return buildResult({
        run_id: runId,
        status: 'completed',
        snapshot_id: null,
        degraded: false,
        dry_run: true,
        facts,
        insights,
      });
    }

    const periodStart = facts.meta.period_start;
    const periodEnd = facts.meta.period_end;

    let snapshotId;
    if (existingSnapshotId && force) {
      const upd = await client.query(
        `UPDATE financial_snapshots SET
           period_start = $2::date,
           period_end = $3::date,
           facts = $4::jsonb,
           ai_summary = $5,
           recommendations = $6::jsonb,
           risks = $7::jsonb,
           run_id = $8
         WHERE id = $1
         RETURNING id`,
        [
          existingSnapshotId,
          periodStart,
          periodEnd,
          JSON.stringify(facts),
          insights.ai_summary,
          JSON.stringify(insights.recommendations),
          JSON.stringify(insights.risks),
          runId,
        ]
      );
      snapshotId = upd.rows[0].id;
    } else {
      const ins = await client.query(
        `INSERT INTO financial_snapshots (
           snapshot_date, period_start, period_end, facts,
           ai_summary, recommendations, risks, run_id
         ) VALUES ($1::date, $2::date, $3::date, $4::jsonb, $5, $6::jsonb, $7::jsonb, $8)
         RETURNING id`,
        [
          snapshotDate,
          periodStart,
          periodEnd,
          JSON.stringify(facts),
          insights.ai_summary,
          JSON.stringify(insights.recommendations),
          JSON.stringify(insights.risks),
          runId,
        ]
      );
      snapshotId = ins.rows[0].id;
    }

    await finishRun(client, runId, {
      status: 'completed',
      model_provider: 'none',
      model_name: null,
      prompt_version: PROMPT_VERSION,
      details: {
        snapshot_date: snapshotDate,
        snapshot_id: snapshotId,
        force,
        replaced: Boolean(existingSnapshotId && force),
        degraded: false,
      },
    });

    await client.query('COMMIT');
    log('[cashflow-intel] completed snapshot %s for %s', snapshotId, snapshotDate);

    return buildResult({
      run_id: runId,
      status: 'completed',
      snapshot_id: snapshotId,
      degraded: false,
      facts,
      insights,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});

    const message = err?.message || String(err);
    log('[cashflow-intel] failed: %s', message);

    let failedRunId = null;
    try {
      failedRunId = await insertRun({
        status: 'failed',
        error_message: message,
        details: { snapshot_date: snapshotDate, force, dry_run: dryRun, prior_run_id: runId },
      });
    } catch (_) {}

    return buildResult({
      run_id: failedRunId || runId,
      status: 'failed',
      snapshot_id: null,
      degraded: false,
      error: message,
    });
  } finally {
    client.release();
  }
}

async function insertRun(fields, db = pool) {
  const r = await db.query(
    `INSERT INTO ai_operation_runs (operation_type, status, model_provider, model_name, prompt_version, error_message, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING id`,
    [
      OPERATION_TYPE,
      fields.status,
      fields.model_provider || null,
      fields.model_name || null,
      fields.prompt_version || null,
      fields.error_message || null,
      JSON.stringify(fields.details || {}),
    ]
  );
  return r.rows[0].id;
}

async function finishRun(db, runId, fields) {
  await db.query(
    `UPDATE ai_operation_runs SET
       status = $2,
       finished_at = NOW(),
       model_provider = COALESCE($3, model_provider),
       model_name = $4,
       prompt_version = COALESCE($5, prompt_version),
       error_message = $6,
       details = COALESCE(details, '{}'::jsonb) || $7::jsonb
     WHERE id = $1`,
    [
      runId,
      fields.status,
      fields.model_provider,
      fields.model_name,
      fields.prompt_version,
      fields.error_message || null,
      JSON.stringify(fields.details || {}),
    ]
  );
}

function buildResult(partial) {
  const facts = partial.facts;
  return {
    ok: partial.status === 'completed' || partial.status === 'skipped',
    run_id: partial.run_id,
    status: partial.status,
    snapshot_id: partial.snapshot_id,
    degraded: partial.degraded === true,
    reason: partial.reason || null,
    error: partial.error || null,
    dry_run: partial.dry_run === true,
    facts: facts || null,
    insights: partial.insights || null,
    summary: facts
      ? {
          high_certainty: facts.income.high_certainty,
          possible: facts.income.possible,
          expected_expenses: facts.expenses.expected_total,
          gap_amount: facts.cashflow.gap_amount,
          has_gap: facts.cashflow.has_gap,
        }
      : null,
  };
}

module.exports = {
  runCashflowIntelligence,
  OPERATION_TYPE,
  ADVISORY_LOCK_ID,
};
