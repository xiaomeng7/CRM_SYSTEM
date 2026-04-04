/**
 * Internal Ad Creative Library — CRUD on ad_creatives (no Google publish).
 */

const { pool } = require('../lib/db');
const { bumpVersionLabel, forkCreativeCode, insertVersionEvent } = require('./adAssetVersioning');

const PRODUCT_LINES = new Set(['pre_purchase', 'rental', 'energy']);
const STATUSES = new Set(['draft', 'active', 'paused', 'archived']);

function trim(v) {
  if (v == null) return '';
  return String(v).trim();
}

function isUuid(s) {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
}

/**
 * @param {object} body
 */
async function createCreative(body = {}) {
  const name = trim(body.name) || trim(body.headline) || 'Untitled creative';
  const platform = trim(body.platform) || 'google';
  const productLineRaw = trim(body.product_line).toLowerCase() || null;
  const productLine = productLineRaw || null;
  if (productLine && !PRODUCT_LINES.has(productLine)) {
    const e = new Error(`product_line must be one of: ${[...PRODUCT_LINES].join(', ')}`);
    e.code = 'VALIDATION';
    throw e;
  }
  const status = trim(body.status) || 'draft';
  if (!STATUSES.has(status)) {
    const e = new Error(`status must be one of: ${[...STATUSES].join(', ')}`);
    e.code = 'VALIDATION';
    throw e;
  }
  const angle = trim(body.angle) || null;
  const headline = trim(body.headline) || null;
  const description = trim(body.description) || null;
  const cta = trim(body.cta) || null;
  const version = trim(body.version) || null;
  const campaignId = trim(body.campaign_id);
  const sourceId = trim(body.source_id);
  const creativeCode = trim(body.creative_code) || null;
  const landingUrl = trim(body.landing_url) || null;
  const creativeType = trim(body.creative_type) || null;

  const metaJson =
    body.metadata && typeof body.metadata === 'object' ? JSON.stringify(body.metadata) : '{}';

  const r = await pool.query(
    `INSERT INTO ad_creatives (
       campaign_id, source_id, creative_code, name, creative_type, landing_url,
       status, metadata,
       platform, product_line, angle, headline, description, cta, version
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8::jsonb,
       $9, $10, $11, $12, $13, $14, $15
     ) RETURNING *`,
    [
      campaignId && isUuid(campaignId) ? campaignId : null,
      sourceId && isUuid(sourceId) ? sourceId : null,
      creativeCode,
      name,
      creativeType,
      landingUrl,
      status,
      metaJson,
      platform,
      productLine,
      angle,
      headline,
      description,
      cta,
      version,
    ]
  );
  return r.rows[0];
}

/**
 * @param {object} filters
 */
async function listCreatives(filters = {}) {
  const limit = Math.min(Math.max(parseInt(String(filters.limit || '100'), 10) || 100, 1), 500);
  const params = [];
  const where = [];
  let i = 1;
  if (filters.status) {
    params.push(String(filters.status).trim().toLowerCase());
    where.push(`status = $${i++}`);
  }
  if (filters.platform) {
    params.push(String(filters.platform).trim().toLowerCase());
    where.push(`LOWER(TRIM(platform)) = $${i++}`);
  }
  if (filters.product_line) {
    params.push(String(filters.product_line).trim().toLowerCase());
    where.push(`LOWER(TRIM(product_line)) = $${i++}`);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(limit);
  const r = await pool.query(
    `SELECT * FROM ad_creatives ${w} ORDER BY updated_at DESC NULLS LAST, created_at DESC LIMIT $${i}`,
    params
  );
  return r.rows;
}

/**
 * @param {string} id
 * @param {object} patch
 */
async function patchCreative(id, patch = {}) {
  if (!isUuid(id)) {
    const e = new Error('Invalid id');
    e.code = 'VALIDATION';
    throw e;
  }

  const existingRes = await pool.query(`SELECT id, status FROM ad_creatives WHERE id = $1::uuid`, [id]);
  const existing = existingRes.rows[0];
  if (!existing) return null;

  const patchKeys = Object.keys(patch || {}).filter(
    (k) => patch[k] !== undefined && !['sync_secret'].includes(k)
  );
  if (String(existing.status || '').toLowerCase() === 'active') {
    const onlyStatus = patchKeys.length === 1 && patchKeys[0] === 'status';
    const nextSt = onlyStatus ? trim(patch.status).toLowerCase() : '';
    if (!onlyStatus || !['paused', 'archived'].includes(nextSt)) {
      const e = new Error(
        'Active creative cannot be edited in place. Use POST /api/ads/creatives/:id/publish-new-version, or set status to paused/archived first.'
      );
      e.code = 'ACTIVE_IMMUTABLE';
      throw e;
    }
  }

  const allowed = [
    ['name', 'name'],
    ['status', 'status'],
    ['version', 'version'],
    ['platform', 'platform'],
    ['product_line', 'product_line'],
    ['angle', 'angle'],
    ['headline', 'headline'],
    ['description', 'description'],
    ['cta', 'cta'],
    ['creative_code', 'creative_code'],
    ['landing_url', 'landing_url'],
    ['creative_type', 'creative_type'],
    ['campaign_id', 'campaign_id'],
    ['source_id', 'source_id'],
  ];
  const sets = [];
  const vals = [];
  let idx = 1;
  for (const [key, col] of allowed) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    const raw = patch[key];
    if (key === 'name') {
      const t = trim(raw);
      if (!t) {
        const e = new Error('name cannot be empty');
        e.code = 'VALIDATION';
        throw e;
      }
      vals.push(t);
      sets.push(`${col} = $${idx++}`);
      continue;
    }
    if (key === 'campaign_id' || key === 'source_id') {
      const t = trim(raw);
      vals.push(t && isUuid(t) ? t : null);
    } else if (key === 'status') {
      const s = trim(raw).toLowerCase();
      if (s && !STATUSES.has(s)) {
        const e = new Error(`status must be one of: ${[...STATUSES].join(', ')}`);
        e.code = 'VALIDATION';
        throw e;
      }
      vals.push(s || null);
    } else if (key === 'product_line') {
      const p = trim(raw).toLowerCase();
      if (p && !PRODUCT_LINES.has(p)) {
        const e = new Error(`product_line must be one of: ${[...PRODUCT_LINES].join(', ')}`);
        e.code = 'VALIDATION';
        throw e;
      }
      vals.push(p || null);
    } else {
      vals.push(raw == null || raw === '' ? null : String(raw).trim());
    }
    sets.push(`${col} = $${idx++}`);
  }
  if (patch.metadata !== undefined) {
    sets.push(`metadata = COALESCE($${idx}::jsonb, '{}'::jsonb)`);
    vals.push(
      patch.metadata && typeof patch.metadata === 'object' ? JSON.stringify(patch.metadata) : '{}'
    );
    idx += 1;
  }
  if (!sets.length) {
    const e = new Error('No updatable fields in body');
    e.code = 'VALIDATION';
    throw e;
  }
  vals.push(id);
  const r = await pool.query(
    `UPDATE ad_creatives SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx}::uuid RETURNING *`,
    vals
  );
  return r.rows[0] || null;
}

/**
 * Fork a new creative row with bumped version; old row unchanged (optionally paused).
 * @param {string} id
 * @param {object} [opts] - { edits?, initial_status?, deactivate_previous?, version? }
 */
async function publishNewCreativeVersion(id, opts = {}) {
  if (!isUuid(id)) {
    const e = new Error('Invalid id');
    e.code = 'VALIDATION';
    throw e;
  }
  const edits = opts.edits && typeof opts.edits === 'object' ? opts.edits : {};
  const initialStatus = trim(opts.initial_status).toLowerCase() || 'draft';
  if (!STATUSES.has(initialStatus)) {
    const e = new Error(`initial_status must be one of: ${[...STATUSES].join(', ')}`);
    e.code = 'VALIDATION';
    throw e;
  }
  const deactivatePrevious = opts.deactivate_previous === true;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(`SELECT * FROM ad_creatives WHERE id = $1::uuid FOR UPDATE`, [id]);
    const old = cur.rows[0];
    if (!old) {
      await client.query('ROLLBACK');
      return null;
    }

    const oldVer = trim(old.version) || null;
    const newVer = trim(opts.version) || bumpVersionLabel(oldVer || 'v1');

    let creativeCode = old.creative_code;
    if (old.campaign_id && old.creative_code) {
      creativeCode = forkCreativeCode(old.creative_code, newVer);
    }

    let metadata = old.metadata;
    if (metadata == null) metadata = {};
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        metadata = {};
      }
    }
    if (edits.metadata && typeof edits.metadata === 'object') {
      metadata = { ...metadata, ...edits.metadata };
    }
    metadata.forked_from = old.id;
    metadata.forked_at = new Date().toISOString();
    metadata.previous_version_label = oldVer;

    const pick = (key, fallback) =>
      Object.prototype.hasOwnProperty.call(edits, key) ? edits[key] : fallback;

    const nameRaw = pick('name', old.name);
    const name = trim(nameRaw) || trim(old.name) || 'Untitled creative';
    const platform = trim(pick('platform', old.platform) || '') || 'google';
    const productLineRaw = pick('product_line', old.product_line);
    const productLine = productLineRaw != null ? trim(String(productLineRaw)).toLowerCase() || null : old.product_line;
    if (productLine && !PRODUCT_LINES.has(productLine)) {
      const e = new Error(`product_line must be one of: ${[...PRODUCT_LINES].join(', ')}`);
      e.code = 'VALIDATION';
      throw e;
    }
    const angle = pick('angle', old.angle);
    const headline = pick('headline', old.headline);
    const description = pick('description', old.description);
    const cta = pick('cta', old.cta);
    const creativeType = pick('creative_type', old.creative_type);
    const landingUrl = pick('landing_url', old.landing_url);

    let campaignId = old.campaign_id;
    if (Object.prototype.hasOwnProperty.call(edits, 'campaign_id')) {
      const t = trim(edits.campaign_id);
      campaignId = t && isUuid(t) ? t : null;
    }
    let sourceId = old.source_id;
    if (Object.prototype.hasOwnProperty.call(edits, 'source_id')) {
      const t = trim(edits.source_id);
      sourceId = t && isUuid(t) ? t : null;
    }
    if (Object.prototype.hasOwnProperty.call(edits, 'creative_code')) {
      const t = trim(edits.creative_code);
      creativeCode = t || null;
    }

    const ins = await client.query(
      `INSERT INTO ad_creatives (
         campaign_id, source_id, creative_code, name, creative_type, landing_url,
         status, metadata,
         platform, product_line, angle, headline, description, cta, version
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8::jsonb,
         $9, $10, $11, $12, $13, $14, $15
       ) RETURNING *`,
      [
        campaignId,
        sourceId,
        creativeCode,
        name,
        creativeType != null ? trim(String(creativeType)) || null : null,
        landingUrl != null ? trim(String(landingUrl)) || null : null,
        initialStatus,
        JSON.stringify(metadata),
        platform,
        productLine,
        angle != null ? trim(String(angle)) || null : null,
        headline != null ? trim(String(headline)) || null : null,
        description != null ? trim(String(description)) || null : null,
        cta != null ? trim(String(cta)) || null : null,
        newVer,
      ]
    );
    const created = ins.rows[0];

    if (deactivatePrevious && String(old.status || '').toLowerCase() === 'active') {
      await client.query(
        `UPDATE ad_creatives SET status = 'paused', updated_at = NOW() WHERE id = $1::uuid`,
        [old.id]
      );
    }

    await insertVersionEvent(client, {
      object_type: 'creative',
      old_id: old.id,
      new_id: created.id,
      old_version: oldVer,
      new_version: newVer,
      meta: {
        initial_status: initialStatus,
        deactivate_previous: deactivatePrevious,
      },
    });

    await client.query('COMMIT');
    return {
      creative: created,
      forked_from_id: old.id,
      previous_status_deactivated:
        deactivatePrevious && String(old.status || '').toLowerCase() === 'active',
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  createCreative,
  listCreatives,
  patchCreative,
  publishNewCreativeVersion,
  PRODUCT_LINES,
  STATUSES,
};
