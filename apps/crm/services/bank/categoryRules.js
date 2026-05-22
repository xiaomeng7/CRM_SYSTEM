/**
 * Deterministic category keyword rules (no AI).
 */

const RULES = [
  { pattern: /\bato\b|tax office|bas payment/i, code: 'tax', confidence: 0.9 },
  { pattern: /\bwage\b|payroll|salary|xero payroll/i, code: 'payroll', confidence: 0.9 },
  { pattern: /\bmiddy\b|\blmg\b|rexel|wholesaler|schneider electric/i, code: 'supplier', confidence: 0.85 },
  { pattern: /\bbp\b|shell|ampol|caltex|7-eleven fuel/i, code: 'fuel', confidence: 0.85 },
  { pattern: /insurance|suncorp|allianz|qbe/i, code: 'insurance', confidence: 0.8 },
  { pattern: /google|microsoft|adobe|openai|github|xero|slack|notion/i, code: 'software', confidence: 0.8 },
  { pattern: /super|rest super|australian super|hostplus/i, code: 'super', confidence: 0.85 },
  { pattern: /\brent\b|real estate|landlord/i, code: 'rent', confidence: 0.75 },
  { pattern: /rego|vehicle|toll|car loan/i, code: 'vehicle', confidence: 0.75 },
  { pattern: /transfer to|transfer from|tfr to|tfr from|internal transfer/i, code: 'transfer', confidence: 0.85 },
  { pattern: /owner draw|drawings|personal transfer/i, code: 'owner_draw', confidence: 0.8 },
  { pattern: /payment received|deposit|customer payment|invoice payment/i, code: 'customer_payment', confidence: 0.75 },
];

function matchCategoryByRules(descriptionNorm, counterpartyKey) {
  const hay = `${descriptionNorm || ''} ${counterpartyKey || ''}`;
  for (const rule of RULES) {
    if (rule.pattern.test(hay)) {
      return { code: rule.code, confidence: rule.confidence, source: 'rule' };
    }
  }
  return { code: 'unknown', confidence: 0.3, source: 'none' };
}

module.exports = {
  RULES,
  matchCategoryByRules,
};
