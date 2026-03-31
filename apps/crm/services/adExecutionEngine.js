/**
 * Ad Execution Engine v1 — build payloads and enqueue approved variants.
 * Does not call Google / Meta APIs or publish ads.
 */

const { pool } = require('../lib/db');

function pageKeyFromProductFocus(productFocus) {
  if (!productFocus || !String(productFocus).trim()) return null;
  const s = String(productFocus).trim().replace(/[^a-z0-9_]/gi, '_');
  return `${s}_landing`;
}

/**
 * @param {object} adVariant row from ad_variants
 * @param {object|null} landingVariant row from landing_page_variants
 * @param {object|null} campaign row from campaigns
 */
function buildAdPayload(adVariant, landingVariant, campaign) {
  const campaignOut = campaign
    ? {
        id: campaign.id,
        code: campaign.code ?? null,
        name: campaign.name ?? null,
        objective: campaign.objective ?? null,
        status: campaign.status ?? null,
      }
    : {
        id: adVariant.campaign_id ?? null,
        code: null,
        name: null,
        objective: null,
        status: null,
      };

  const landing_page = landingVariant
    ? {
        headline: landingVariant.headline,
        cta: landingVariant.cta_text || null,
        page_key: landingVariant.page_key,
      }
    : {
        headline: null,
        cta: null,
        page_key: pageKeyFromProductFocus(adVariant.product_focus),
      };

  return {
    channel: adVariant.channel,
    campaign: campaignOut,
    ad: {
      headline: adVariant.headline,
      description: adVariant.body_text,
      cta: adVariant.call_to_action || null,
    },
    landing_page,
    metadata: {
      variant_id: adVariant.id,
      landing_variant_id: landingVariant ? landingVariant.id : null,
      campaign_id: adVariant.campaign_id ?? null,
      campaign_key: adVariant.campaign_key ?? null,
      product_focus: adVariant.product_focus ?? null,
      audience_segment: adVariant.audience_segment ?? null,
      variant_label: adVariant.variant_label ?? null,
    },
  };
}

/**
 * Pick best approved landing variant for an ad variant.
 * @param {import('pg').Pool} db
 */
async function findLandingForAdVariant(db, ad) {
  if (ad.campaign_id) {
    const r = await db.query(
      `SELECT * FROM landing_page_variants
       WHERE status = 'approved'
         AND campaign_id = $1::uuid
       ORDER BY created_at DESC
       LIMIT 1`,
      [ad.campaign_id]
    );
    if (r.rows[0]) return r.rows[0];
  }

  const pk = pageKeyFromProductFocus(ad.product_focus);
  if (pk) {
    const r2 = await db.query(
      `SELECT * FROM landing_page_variants
       WHERE status = 'approved'
         AND page_key = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [pk]
    );
    if (r2.rows[0]) return r2.rows[0];
  }

  if (ad.campaign_key) {
    const r3 = await db.query(
      `SELECT * FROM landing_page_variants
       WHERE status = 'approved'
         AND campaign_key = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [ad.campaign_key]
    );
    if (r3.rows[0]) return r3.rows[0];
  }

  return null;
}

async function loadCampaign(db, campaignId) {
  if (!campaignId) return null;
  const r = await db.query(
    `SELECT id, code, name, objective, status FROM campaigns WHERE id = $1::uuid LIMIT 1`,
    [campaignId]
  );
  return r.rows[0] || null;
}

/**
 * Enqueue approved ad_variants that are not already in the queue.
 * Rules: only ad_variants.status = 'approved'; skip if ad_execution_queue already has this variant_id;
 * INSERT uses ON CONFLICT (variant_id) DO NOTHING for race-safe dedupe.
 * @returns {Promise<{ enqueued: number, skipped: number, errors: Array<{ variant_id: string, error: string }> }>}
 */
async function enqueueApprovedVariants(db = pool) {
  const pendingAds = await db.query(
    `SELECT a.*
     FROM ad_variants a
     WHERE a.status = 'approved'
       AND NOT EXISTS (
         SELECT 1 FROM ad_execution_queue q
         WHERE q.variant_id = a.id
       )
     ORDER BY a.created_at ASC`
  );

  let enqueued = 0;
  let skipped = 0;
  const errors = [];

  for (const ad of pendingAds.rows) {
    try {
      const landing = await findLandingForAdVariant(db, ad);
      const campaign = await loadCampaign(db, ad.campaign_id);
      const payload = buildAdPayload(ad, landing, campaign);

      const ins = await db.query(
        `INSERT INTO ad_execution_queue (
           variant_id, landing_variant_id, campaign_id, campaign_key,
           channel, payload, status, created_by
         ) VALUES (
           $1, $2, $3, $4,
           $5, $6::jsonb, 'pending', 'ad-execution-engine'
         )
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          ad.id,
          landing ? landing.id : null,
          ad.campaign_id || null,
          ad.campaign_key || null,
          ad.channel,
          JSON.stringify(payload),
        ]
      );

      if (ins.rowCount === 0) {
        skipped += 1;
      } else {
        enqueued += 1;
      }
    } catch (e) {
      errors.push({ variant_id: ad.id, error: e.message || String(e) });
    }
  }

  return { enqueued, skipped, errors };
}

/**
 * List queue rows. Defaults to pending + ready (excludes executed/failed unless filtered).
 * @param {{ status?: string|string[], limit?: number, include_all?: boolean }} filters
 */
async function listExecutionQueue(filters = {}, db = pool) {
  const limit = Math.min(Math.max(parseInt(String(filters.limit || '100'), 10) || 100, 1), 500);
  const conditions = [];
  const params = [];
  let i = 1;

  if (filters.include_all) {
    conditions.push('1=1');
  } else if (filters.status != null && String(filters.status).trim() !== '') {
    const raw = Array.isArray(filters.status) ? filters.status : String(filters.status).split(',');
    const statuses = raw.map((s) => String(s).trim()).filter(Boolean);
    if (statuses.length === 1) {
      params.push(statuses[0]);
      conditions.push(`status = $${i++}`);
    } else if (statuses.length > 1) {
      params.push(statuses);
      conditions.push(`status = ANY($${i++}::text[])`);
    } else {
      conditions.push(`status IN ('pending', 'ready')`);
    }
  } else {
    conditions.push(`status IN ('pending', 'ready')`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const r = await db.query(
    `SELECT * FROM ad_execution_queue ${where} ORDER BY created_at DESC LIMIT ${limit}`,
    params
  );
  return r.rows;
}

/**
 * OpenClaw / publisher: pending + ready only, fixed column projection, FIFO.
 * @param {{ status?: 'pending'|'ready', limit?: number }} filters
 */
async function listPublishQueue(filters = {}, db = pool) {
  const limit = Math.min(Math.max(parseInt(String(filters.limit || '100'), 10) || 100, 1), 500);
  const params = [];
  let i = 1;
  let statusClause = `status IN ('pending', 'ready')`;
  const s = filters.status != null ? String(filters.status).trim().toLowerCase() : '';
  if (s === 'pending' || s === 'ready') {
    params.push(s);
    statusClause = `status = $${i++}`;
  } else if (s !== '') {
    throw new Error('status filter must be pending, ready, or omitted');
  }

  const r = await db.query(
    `SELECT id, variant_id, landing_variant_id, campaign_id, campaign_key, channel, payload, status,
            execution_notes, created_at
     FROM ad_execution_queue
     WHERE ${statusClause}
     ORDER BY created_at ASC
     LIMIT ${limit}`,
    params
  );
  return r.rows;
}

function mergeExecutionNotes(existing, addition) {
  const add = String(addition ?? '').trim();
  if (!add) return existing != null ? String(existing) : null;
  const prev = existing != null ? String(existing).trim() : '';
  if (!prev) return add;
  return `${prev}\n${add}`;
}

/**
 * Human gate: pending → ready (OpenClaw may prefer consuming `ready` only).
 * @param {string} id queue row UUID
 * @param {string|null|undefined} notes appended to execution_notes when non-empty
 * @param {import('pg').Pool} [db]
 * @returns {Promise<object>}
 */
async function markQueueReady(id, notes, db = pool) {
  const sel = await db.query(
    `SELECT execution_notes, status FROM ad_execution_queue WHERE id = $1::uuid`,
    [id]
  );
  if (!sel.rows[0]) {
    const e = new Error('queue item not found');
    e.code = 'NOT_FOUND';
    throw e;
  }
  if (sel.rows[0].status !== 'pending') {
    const e = new Error(`mark-ready only allowed when status is pending (current: ${sel.rows[0].status})`);
    e.code = 'INVALID_STATE';
    throw e;
  }

  const merged =
    notes != null && String(notes).trim() !== ''
      ? mergeExecutionNotes(sel.rows[0].execution_notes, notes)
      : sel.rows[0].execution_notes;

  const u = await db.query(
    `UPDATE ad_execution_queue
     SET status = 'ready', execution_notes = $2
     WHERE id = $1::uuid AND status = 'pending'
     RETURNING *`,
    [id, merged]
  );
  if (!u.rows[0]) {
    const e = new Error('mark-ready failed: row is no longer pending');
    e.code = 'INVALID_STATE';
    throw e;
  }
  return u.rows[0];
}

/**
 * Roll back: ready → pending (e.g. mistaken approval).
 * @param {string} id queue row UUID
 * @param {string|null|undefined} notes appended when non-empty
 * @param {import('pg').Pool} [db]
 */
async function markQueuePending(id, notes, db = pool) {
  const sel = await db.query(
    `SELECT execution_notes, status FROM ad_execution_queue WHERE id = $1::uuid`,
    [id]
  );
  if (!sel.rows[0]) {
    const e = new Error('queue item not found');
    e.code = 'NOT_FOUND';
    throw e;
  }
  if (sel.rows[0].status !== 'ready') {
    const e = new Error(`mark-pending only allowed when status is ready (current: ${sel.rows[0].status})`);
    e.code = 'INVALID_STATE';
    throw e;
  }

  const merged =
    notes != null && String(notes).trim() !== ''
      ? mergeExecutionNotes(sel.rows[0].execution_notes, notes)
      : sel.rows[0].execution_notes;

  const u = await db.query(
    `UPDATE ad_execution_queue
     SET status = 'pending', execution_notes = $2
     WHERE id = $1::uuid AND status = 'ready'
     RETURNING *`,
    [id, merged]
  );
  if (!u.rows[0]) {
    const e = new Error('mark-pending failed: row is no longer ready');
    e.code = 'INVALID_STATE';
    throw e;
  }
  return u.rows[0];
}

/**
 * Record publisher result (OpenClaw or manual); does not call ad platforms.
 * @param {{ id: string, status: 'executed'|'failed', execution_notes?: string|null }} input
 */
async function completePublishTask(db, input) {
  const queueId = input.id;
  const status = String(input.status || '').trim().toLowerCase();
  if (status !== 'executed' && status !== 'failed') {
    throw new Error('status must be executed or failed');
  }
  const notes = input.execution_notes != null ? String(input.execution_notes) : null;

  const r = await db.query(
    `UPDATE ad_execution_queue SET
       status = $2,
       execution_notes = $3,
       executed_at = CASE WHEN $2::text = 'executed' THEN NOW() ELSE NULL END
     WHERE id = $1::uuid
     RETURNING id, variant_id, landing_variant_id, campaign_id, campaign_key, channel, payload, status,
               execution_notes, executed_at, created_at, created_by`,
    [queueId, status, notes]
  );
  return r.rows[0] || null;
}

/**
 * Mark queue row status (e.g. pending → ready) for manual / future automation.
 * Not exposed as required v1 API; available for scripts or future routes.
 */
async function updateQueueStatus(db, queueId, { status, execution_notes, executed_at } = {}) {
  const sets = [];
  const params = [];
  let n = 1;
  if (status != null) {
    params.push(String(status));
    sets.push(`status = $${n++}`);
  }
  if (execution_notes !== undefined) {
    params.push(execution_notes);
    sets.push(`execution_notes = $${n++}`);
  }
  if (executed_at !== undefined) {
    params.push(executed_at);
    sets.push(`executed_at = $${n++}`);
  }
  if (!sets.length) return null;
  params.push(queueId);
  const r = await db.query(
    `UPDATE ad_execution_queue SET ${sets.join(', ')} WHERE id = $${n}::uuid RETURNING *`,
    params
  );
  return r.rows[0] || null;
}

module.exports = {
  buildAdPayload,
  pageKeyFromProductFocus,
  findLandingForAdVariant,
  enqueueApprovedVariants,
  listExecutionQueue,
  listPublishQueue,
  completePublishTask,
  markQueueReady,
  markQueuePending,
  mergeExecutionNotes,
  updateQueueStatus,
};
