/**
 * Admin 自动化开关：读写 automation_settings 表。
 */

const { pool } = require('../lib/db');

async function get(key) {
  try {
    const r = await pool.query(
      `SELECT value FROM automation_settings WHERE key = $1`,
      [key]
    );
    return r.rows[0]?.value ?? null;
  } catch (_) {
    return null;
  }
}

/** 未配置或表不存在时默认 true（保持原有行为） */
async function getEnabled(key) {
  const v = await get(key);
  if (v === null) return true;
  return v === 'true' || v === '1';
}

async function set(key, value) {
  const v = value === true || value === 'true' || value === '1' ? 'true' : 'false';
  await pool.query(
    `INSERT INTO automation_settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, v]
  );
  return v;
}

async function getAll() {
  try {
    const r = await pool.query(
      `SELECT key, value, updated_at FROM automation_settings`
    );
    const out = {};
    for (const row of r.rows) {
      out[row.key] = row.value;
      out[row.key + '_updated_at'] = row.updated_at;
    }
    return out;
  } catch (_) {
    return {};
  }
}

async function setBulk(obj) {
  for (const [key, value] of Object.entries(obj)) {
    if (key.endsWith('_updated_at')) continue;
    await set(key, value);
  }
  return getAll();
}

module.exports = { get, getEnabled, set, getAll, setBulk };
