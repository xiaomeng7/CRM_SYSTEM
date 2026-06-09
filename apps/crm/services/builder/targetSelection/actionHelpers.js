/**
 * Shared helpers for founder action rules (PR8E.1).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysSinceContact(lastContactedAt, now = new Date()) {
  if (!lastContactedAt) return null;
  const d = new Date(lastContactedAt);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / MS_PER_DAY));
}

module.exports = { daysSinceContact, MS_PER_DAY };
