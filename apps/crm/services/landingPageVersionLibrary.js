/**
 * Landing Page Version Library — registry only (no rendering / CMS).
 */

const { pool } = require('../lib/db');
const { bumpVersionLabel, insertVersionEvent } = require('./adAssetVersioning');

const PRODUCT_LINES = new Set(['pre_purchase', 'rental', 'energy']);
const STATUSES = new Set(['draft', 'active', 'archived']);

function trim(v) {
  if (v == null) return '';
  return String(v).trim();
}

function isUuid(s) {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
}

async function createVersion(body = {}) {
  const productLine = trim(body.product_line).toLowerCase();
  if (!productLine || !PRODUCT_LINES.has(productLine)) {
    const e = new Error(`product_line is required; one of: ${[...PRODUCT_LINES].join(', ')}`);
    e.code = 'VALIDATION';
    throw e;
  }
  const version = trim(body.version);
  if (!version) {
    const e = new Error('version is required (use same value as URL lpv= when tracking)');
    e.code = 'VALIDATION';
    throw e;
  }
  const pageName = trim(body.page_name);
  if (!pageName) {
    const e = new Error('page_name is required');
    e.code = 'VALIDATION';
    throw e;
  }
  let routePath = trim(body.route_path);
  if (!routePath) {
    const e = new Error('route_path is required (e.g. /index.html)');
    e.code = 'VALIDATION';
    throw e;
  }
  if (!routePath.startsWith('/')) routePath = `/${routePath}`;

  const status = trim(body.status).toLowerCase() || 'draft';
  if (!STATUSES.has(status)) {
    const e = new Error(`status must be one of: ${[...STATUSES].join(', ')}`);
    e.code = 'VALIDATION';
    throw e;
  }

  const headline = trim(body.headline) || null;
  const subheadline = trim(body.subheadline) || null;
  const ctaText = trim(body.cta_text) || null;

  const r = await pool.query(
    `INSERT INTO landing_page_versions (
       product_line, version, page_name, route_path, headline, subheadline, cta_text, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [productLine, version, pageName, routePath, headline, subheadline, ctaText, status]
  );
  return r.rows[0];
}

async function listVersions(filters = {}) {
  const limit = Math.min(Math.max(parseInt(String(filters.limit || '100'), 10) || 100, 1), 500);
  const params = [];
  const where = [];
  let i = 1;
  if (filters.status) {
    params.push(String(filters.status).trim().toLowerCase());
    where.push(`status = $${i++}`);
  }
  if (filters.product_line) {
    params.push(String(filters.product_line).trim().toLowerCase());
    where.push(`product_line = $${i++}`);
  }
  if (filters.version) {
    params.push(String(filters.version).trim());
    where.push(`version = $${i++}`);
  }
  if (filters.route_path) {
    params.push(String(filters.route_path).trim());
    where.push(`route_path = $${i++}`);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(limit);
  const r = await pool.query(
    `SELECT * FROM landing_page_versions ${w}
     ORDER BY updated_at DESC NULLS LAST, created_at DESC
     LIMIT $${i}`,
    params
  );
  return r.rows;
}

async function patchVersion(id, patch = {}) {
  if (!isUuid(id)) {
    const e = new Error('Invalid id');
    e.code = 'VALIDATION';
    throw e;
  }

  const existingRes = await pool.query(`SELECT id, status FROM landing_page_versions WHERE id = $1::uuid`, [id]);
  const existing = existingRes.rows[0];
  if (!existing) return null;

  const patchKeys = Object.keys(patch || {}).filter(
    (k) => patch[k] !== undefined && !['sync_secret'].includes(k)
  );
  if (String(existing.status || '').toLowerCase() === 'active') {
    const onlyStatus = patchKeys.length === 1 && patchKeys[0] === 'status';
    const nextSt = onlyStatus ? trim(patch.status).toLowerCase() : '';
    if (!onlyStatus || nextSt !== 'archived') {
      const e = new Error(
        'Active landing page version cannot be edited in place. Use POST /api/ads/landing-pages/:id/publish-new-version, or set status to archived to deprecate.'
      );
      e.code = 'ACTIVE_IMMUTABLE';
      throw e;
    }
  }

  const allowed = [
    ['product_line', 'product_line'],
    ['version', 'version'],
    ['page_name', 'page_name'],
    ['route_path', 'route_path'],
    ['headline', 'headline'],
    ['subheadline', 'subheadline'],
    ['cta_text', 'cta_text'],
    ['status', 'status'],
  ];
  const sets = [];
  const vals = [];
  let idx = 1;
  for (const [key, col] of allowed) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    const raw = patch[key];
    if (key === 'product_line') {
      const p = trim(raw).toLowerCase();
      if (!PRODUCT_LINES.has(p)) {
        const e = new Error(`product_line must be one of: ${[...PRODUCT_LINES].join(', ')}`);
        e.code = 'VALIDATION';
        throw e;
      }
      vals.push(p);
    } else if (key === 'status') {
      const s = trim(raw).toLowerCase();
      if (!STATUSES.has(s)) {
        const e = new Error(`status must be one of: ${[...STATUSES].join(', ')}`);
        e.code = 'VALIDATION';
        throw e;
      }
      vals.push(s);
    } else if (key === 'route_path') {
      let p = trim(raw);
      if (!p) {
        const e = new Error('route_path cannot be empty');
        e.code = 'VALIDATION';
        throw e;
      }
      if (!p.startsWith('/')) p = `/${p}`;
      vals.push(p);
    } else if (key === 'version' || key === 'page_name') {
      const t = trim(raw);
      if (!t) {
        const e = new Error(`${key} cannot be empty`);
        e.code = 'VALIDATION';
        throw e;
      }
      vals.push(t);
    } else {
      vals.push(raw == null || raw === '' ? null : String(raw).trim());
    }
    sets.push(`${col} = $${idx++}`);
  }
  if (!sets.length) {
    const e = new Error('No updatable fields in body');
    e.code = 'VALIDATION';
    throw e;
  }
  vals.push(id);
  const r = await pool.query(
    `UPDATE landing_page_versions SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $${idx}::uuid RETURNING *`,
    vals
  );
  return r.rows[0] || null;
}

/**
 * Fork a new landing_page_versions row (same route_path, bumped version label).
 * @param {string} id
 * @param {object} [opts] - { edits?, initial_status?, deactivate_previous?, version? }
 */
async function publishNewLandingVersion(id, opts = {}) {
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
    const cur = await client.query(`SELECT * FROM landing_page_versions WHERE id = $1::uuid FOR UPDATE`, [id]);
    const old = cur.rows[0];
    if (!old) {
      await client.query('ROLLBACK');
      return null;
    }

    const oldVer = trim(old.version) || null;
    const newVer = trim(opts.version) || bumpVersionLabel(oldVer || 'v1');

    const clash = await client.query(
      `SELECT 1 FROM landing_page_versions WHERE route_path = $1 AND version = $2 LIMIT 1`,
      [old.route_path, newVer]
    );
    if (clash.rows.length > 0) {
      const e = new Error(`Version label "${newVer}" already exists for route_path ${old.route_path}`);
      e.code = 'DUPLICATE_VERSION';
      throw e;
    }

    const pick = (key, fallback) =>
      Object.prototype.hasOwnProperty.call(edits, key) ? edits[key] : fallback;

    const productLineRaw = pick('product_line', old.product_line);
    const productLine = trim(String(productLineRaw || '')).toLowerCase();
    if (!PRODUCT_LINES.has(productLine)) {
      const e = new Error(`product_line must be one of: ${[...PRODUCT_LINES].join(', ')}`);
      e.code = 'VALIDATION';
      throw e;
    }
    const pageName = trim(String(pick('page_name', old.page_name) || ''));
    if (!pageName) {
      const e = new Error('page_name cannot be empty');
      e.code = 'VALIDATION';
      throw e;
    }
    let routePath = trim(String(pick('route_path', old.route_path) || ''));
    if (!routePath.startsWith('/')) routePath = `/${routePath}`;

    const headline = pick('headline', old.headline);
    const subheadline = pick('subheadline', old.subheadline);
    const ctaText = pick('cta_text', old.cta_text);

    const ins = await client.query(
      `INSERT INTO landing_page_versions (
         product_line, version, page_name, route_path, headline, subheadline, cta_text, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        productLine,
        newVer,
        pageName,
        routePath,
        headline != null ? trim(String(headline)) || null : null,
        subheadline != null ? trim(String(subheadline)) || null : null,
        ctaText != null ? trim(String(ctaText)) || null : null,
        initialStatus,
      ]
    );
    const created = ins.rows[0];

    if (deactivatePrevious && String(old.status || '').toLowerCase() === 'active') {
      await client.query(
        `UPDATE landing_page_versions SET status = 'archived', updated_at = NOW() WHERE id = $1::uuid`,
        [old.id]
      );
    }

    await insertVersionEvent(client, {
      object_type: 'landing_page',
      old_id: old.id,
      new_id: created.id,
      old_version: oldVer,
      new_version: newVer,
      meta: {
        initial_status: initialStatus,
        deactivate_previous: deactivatePrevious,
        route_path: old.route_path,
      },
    });

    await client.query('COMMIT');
    return {
      landing_page_version: created,
      forked_from_id: old.id,
      previous_status_archived:
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
  createVersion,
  listVersions,
  patchVersion,
  publishNewLandingVersion,
  PRODUCT_LINES,
  STATUSES,
};
