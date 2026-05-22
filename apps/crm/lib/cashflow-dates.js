/**
 * Shared Adelaide calendar helpers (avoid circular imports with cashflowFacts).
 */

const TIMEZONE = 'Australia/Adelaide';

function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function getAdelaideYmd(refDate = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(refDate);
  const y = parts.find((p) => p.type === 'year').value;
  const m = parts.find((p) => p.type === 'month').value;
  const d = parts.find((p) => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

function parseYmd(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return { y, m, d };
}

function formatYmdFromUtcDate(dt) {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysYmd(ymd, days) {
  const { y, m, d } = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return formatYmdFromUtcDate(dt);
}

function compareYmd(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function isYmdInRange(ymd, start, end) {
  if (!ymd) return false;
  const s = String(ymd).slice(0, 10);
  return compareYmd(s, start) >= 0 && compareYmd(s, end) <= 0;
}

function ymdFromValue(value) {
  if (!value) return null;
  if (value instanceof Date) return formatYmdFromUtcDate(value);
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

module.exports = {
  TIMEZONE,
  roundMoney,
  getAdelaideYmd,
  addDaysYmd,
  isYmdInRange,
  ymdFromValue,
};
