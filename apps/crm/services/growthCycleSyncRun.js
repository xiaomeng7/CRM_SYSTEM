/**
 * Persist Growth Engine orchestrator runs to sync_runs (039+ columns when present).
 */

const SYNC_TYPE = 'growth_engine';
const SOURCE = 'growth_engine';
const RUN_TYPE = 'daily_cycle';
const CREATED_BY = 'growth-engine';

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @returns {Promise<string|null>}
 */
async function insertGrowthCycleRun(db) {
  try {
    const r = await db.query(
      `INSERT INTO sync_runs (
         sync_type, mode, dry_run, status,
         source, run_type, created_by,
         fetched_count, mapped_count, created_count, updated_count, skipped_count
       ) VALUES (
         $1, 'full', false, 'running',
         $2, $3, $4,
         0, 0, 0, 0, 0
       ) RETURNING id`,
      [SYNC_TYPE, SOURCE, RUN_TYPE, CREATED_BY]
    );
    return r.rows[0]?.id || null;
  } catch (e) {
    if (/column .* does not exist/i.test(e.message || '')) {
      const r2 = await db.query(
        `INSERT INTO sync_runs (sync_type, mode, dry_run, status)
         VALUES ($1, 'full', false, 'running')
         RETURNING id`,
        [SYNC_TYPE]
      );
      return r2.rows[0]?.id || null;
    }
    throw e;
  }
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string|null} runId
 * @param {object} payload
 */
async function finishGrowthCycleRun(db, runId, payload) {
  if (!runId) return;

  const {
    status,
    plans_count,
    ads_generated,
    ads_skipped_recent,
    enqueue_enqueued,
    enqueue_skipped,
    enqueue_errors,
    step_sync_ok,
    step_insights_ok,
    step_plans_ok,
    step_ads_ok,
    step_enqueue_ok,
    error_message,
  } = payload;

  const summary = {
    plans_count: plans_count ?? 0,
    ads_generated: ads_generated ?? 0,
    ads_skipped_recent: ads_skipped_recent ?? 0,
    enqueue_attempted: true,
    enqueue_enqueued: enqueue_enqueued ?? 0,
    enqueue_skipped: enqueue_skipped ?? 0,
    enqueue_errors: enqueue_errors ?? 0,
    step_sync_ok: Boolean(step_sync_ok),
    step_insights_ok: Boolean(step_insights_ok),
    step_plans_ok: Boolean(step_plans_ok),
    step_ads_ok: Boolean(step_ads_ok),
    step_enqueue_ok: Boolean(step_enqueue_ok),
    source: SOURCE,
    run_type: RUN_TYPE,
  };

  const fetched = plans_count ?? 0;
  const created = ads_generated ?? 0;
  const skipped = (ads_skipped_recent ?? 0) + (enqueue_skipped ?? 0);
  const updated = enqueue_enqueued ?? 0;

  const errMsg = error_message != null ? String(error_message).slice(0, 10000) : null;

  try {
    await db.query(
      `UPDATE sync_runs SET
         finished_at = NOW(),
         status = $2,
         fetched_count = $3,
         mapped_count = $4,
         created_count = $5,
         updated_count = $6,
         skipped_count = $7,
         summary = $8::jsonb,
         error_message = $9
       WHERE id = $1::uuid`,
      [runId, status, fetched, 0, created, updated, skipped, JSON.stringify(summary), errMsg]
    );
    return;
  } catch (e) {
    if (!/column .* does not exist/i.test(e.message || '')) {
      throw e;
    }
  }

  const legacyDetails = { ...summary, error_message: errMsg };
  try {
    await db.query(
      `UPDATE sync_runs SET
         finished_at = NOW(),
         status = $2,
         fetched_count = $3,
         created_count = $4,
         updated_count = $5,
         skipped_count = $6,
         details = $7::jsonb,
         error_count = CASE WHEN $8::text IS NOT NULL AND $8::text <> '' THEN 1 ELSE 0 END
       WHERE id = $1::uuid`,
      [
        runId,
        status,
        fetched,
        created,
        updated,
        skipped,
        JSON.stringify(legacyDetails),
        errMsg || '',
      ]
    );
  } catch (e2) {
    console.warn('[growth-engine] sync_runs finish (legacy) failed:', e2.message || e2);
  }
}

function deriveStatus(stats) {
  if (stats.fatal_error) return 'failed';
  const steps = [
    stats.step_sync_ok,
    stats.step_insights_ok,
    stats.step_plans_ok,
    stats.step_ads_ok,
    stats.step_enqueue_ok,
  ];
  const ok = steps.filter(Boolean).length;
  if (ok === steps.length) return 'success';
  if (ok === 0) return 'failed';
  return 'partial';
}

module.exports = {
  insertGrowthCycleRun,
  finishGrowthCycleRun,
  deriveStatus,
  SYNC_TYPE,
  SOURCE,
  RUN_TYPE,
};
