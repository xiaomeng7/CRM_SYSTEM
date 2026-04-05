/**
 * Shared helpers for ad creative / landing page version lineage.
 */

const { pool } = require('../lib/db');

/**
 * Bump a human-readable version label (v1→v2, or append _v2).
 * @param {string} [current]
 */
function bumpVersionLabel(current) {
  const s = String(current == null || current === '' ? 'v1' : current).trim();
  const vm = /^v(\d+)$/i.exec(s);
  if (vm) return `v${parseInt(vm[1], 10) + 1}`;
  const tail = /^(.+)[._]v(\d+)$/i.exec(s);
  if (tail) return `${tail[1]}_v${parseInt(tail[2], 10) + 1}`;
  if (/^\d+$/.test(s)) return String(parseInt(s, 10) + 1);
  return `${s}_v2`;
}

/**
 * Avoid UNIQUE(campaign_id, creative_code) collision on fork: null out or suffix.
 */
function forkCreativeCode(code, newVersionLabel) {
  const c = code == null ? '' : String(code).trim();
  if (!c) return null;
  const suffix = String(newVersionLabel || '').replace(/[^a-z0-9_-]/gi, '_').slice(0, 32);
  return `${c}_fork_${suffix || 'new'}`.slice(0, 100);
}

/**
 * @param {import('pg').PoolClient} client
 * @param {object} row
 */
async function insertVersionEvent(client, row) {
  try {
    await client.query(
      `INSERT INTO ad_asset_version_events (
         object_type, old_id, new_id, old_version, new_version, meta
       ) VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6::jsonb)`,
      [
        row.object_type,
        row.old_id,
        row.new_id,
        row.old_version || null,
        row.new_version || null,
        JSON.stringify(row.meta && typeof row.meta === 'object' ? row.meta : {}),
      ]
    );
  } catch (e) {
    if (/ad_asset_version_events|does not exist/i.test(String(e.message || ''))) {
      console.warn('[ad-asset-versioning] version event table missing; run migration 055:', e.message);
      return;
    }
    throw e;
  }
}

/**
 * @param {object} filters - { object_type?, old_id?, new_id?, limit? }
 */
function isUuid(s) {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
}

async function listVersionEvents(filters = {}, db = pool) {
  const limit = Math.min(Math.max(parseInt(String(filters.limit || '100'), 10) || 100, 1), 500);
  const params = [];
  const where = [];
  let i = 1;
  if (filters.object_type) {
    const ot = String(filters.object_type).trim().toLowerCase();
    if (ot !== 'creative' && ot !== 'landing_page') {
      const e = new Error('object_type must be creative or landing_page');
      e.code = 'VALIDATION';
      throw e;
    }
    params.push(ot);
    where.push(`object_type = $${i++}`);
  }
  if (filters.old_id) {
    const oid = String(filters.old_id).trim();
    if (!isUuid(oid)) {
      const e = new Error('old_id must be a valid UUID');
      e.code = 'VALIDATION';
      throw e;
    }
    params.push(oid);
    where.push(`old_id = $${i++}::uuid`);
  }
  if (filters.new_id) {
    const nid = String(filters.new_id).trim();
    if (!isUuid(nid)) {
      const e = new Error('new_id must be a valid UUID');
      e.code = 'VALIDATION';
      throw e;
    }
    params.push(nid);
    where.push(`new_id = $${i++}::uuid`);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(limit);
  try {
    const r = await db.query(
      `SELECT * FROM ad_asset_version_events ${w}
       ORDER BY changed_at DESC
       LIMIT $${i}`,
      params
    );
    return r.rows;
  } catch (e) {
    if (/ad_asset_version_events|does not exist/i.test(String(e.message || ''))) {
      return [];
    }
    throw e;
  }
}

module.exports = {
  bumpVersionLabel,
  forkCreativeCode,
  insertVersionEvent,
  listVersionEvents,
};
