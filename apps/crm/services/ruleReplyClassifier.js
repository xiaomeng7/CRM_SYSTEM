/**
 * Rule-based reply classifier (zero token).
 */

const RULES = [
  { pattern: /\b(stop|unsubscribe|opt.?out|no more)\b/i, intent: 'unsubscribe' },
  { pattern: /\bwrong number\b/i, intent: 'wrong_number' },
  { pattern: /\bcall\b/i, intent: 'call_request' },
  { pattern: /\b(price|quote|cost)\b/i, intent: 'interested' },
  { pattern: /\bnot interested\b/i, intent: 'not_now' },
  { pattern: /\b(yes|ok|sure|sounds good)\b/i, intent: 'interested' },
];

function ruleClassify(message) {
  if (!message || typeof message !== 'string') return null;
  const m = message.trim();
  if (m.length === 0) return null;
  for (const { pattern, intent } of RULES) {
    if (pattern.test(m)) return intent;
  }
  return null;
}

module.exports = { ruleClassify };
