/**
 * Shared CSV parsing helpers for Australian bank exports.
 */

const crypto = require('crypto');

function stripBom(text) {
  if (!text) return '';
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Parse CSV text into rows of string cells (handles quoted fields). */
function parseCsvRows(text) {
  const lines = stripBom(text).split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows = [];
  for (const line of lines) {
    rows.push(parseCsvLine(line));
  }
  return rows;
}

function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Build map: normalized header -> column index */
function headerIndexMap(headerRow) {
  const map = {};
  headerRow.forEach((h, i) => {
    const key = normalizeHeader(h);
    if (key) map[key] = i;
  });
  return map;
}

function findColumn(map, aliases) {
  for (const a of aliases) {
    const key = normalizeHeader(a);
    if (map[key] != null) return map[key];
  }
  for (const [k, idx] of Object.entries(map)) {
    for (const a of aliases) {
      if (k.includes(normalizeHeader(a))) return idx;
    }
  }
  return null;
}

/** DD/MM/YYYY or YYYY-MM-DD -> YYYY-MM-DD */
function parseDateAU(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dm) {
    const d = dm[1].padStart(2, '0');
    const m = dm[2].padStart(2, '0');
    return `${dm[3]}-${m}-${d}`;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function parseMoney(value) {
  if (value == null || value === '') return null;
  let s = String(value).trim().replace(/\$/g, '').replace(/,/g, '');
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s);
  if (neg) s = s.replace(/[()]/g, '');
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
}

function roundMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function buildExternalHash(bankProfile, txnDate, amount, descriptionNorm) {
  const payload = `${bankProfile}|${txnDate}|${amount}|${descriptionNorm}`;
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 64);
}

module.exports = {
  stripBom,
  parseCsvRows,
  parseCsvLine,
  normalizeHeader,
  headerIndexMap,
  findColumn,
  parseDateAU,
  parseMoney,
  roundMoney,
  buildExternalHash,
};
