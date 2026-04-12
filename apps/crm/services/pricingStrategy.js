/**
 * Pricing strategy (v1): repair_items + inspection verdict + optional lead_score → final quote band.
 * Pure function; does not mutate inputs; no database access.
 */

/**
 * @typedef {Object} PricingStrategyInput
 * @property {unknown} repair_items
 * @property {unknown} inspection
 * @property {unknown} [lead_score]
 */

/**
 * @typedef {Object} PricingStrategyResult
 * @property {number} final_price
 * @property {'premium'|'standard'|'basic'} pricing_tier
 * @property {number} margin_applied  // composite multiplier applied to base_total (risk + lead adjustments)
 */

/**
 * @typedef {Object} RecommendedQuotePackage
 * @property {string} package_name
 * @property {number} price
 * @property {string} description
 */

function isRecord(x) {
  return x != null && typeof x === 'object' && !Array.isArray(x);
}

function asNumber(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function midPriceForItem(item) {
  if (!isRecord(item)) return 0;
  const low =
    asNumber(item.estimated_cost_low) ??
    asNumber(item.budget_low) ??
    asNumber(item.cost_low) ??
    null;
  const high =
    asNumber(item.estimated_cost_high) ??
    asNumber(item.budget_high) ??
    asNumber(item.cost_high) ??
    null;
  if (low != null && high != null) return (low + high) / 2;
  if (low != null) return low;
  if (high != null) return high;
  return 0;
}

function baseTotalFromRepairItems(repair_items) {
  if (!Array.isArray(repair_items)) return 0;
  let sum = 0;
  for (const it of repair_items) {
    sum += midPriceForItem(it);
  }
  return sum;
}

function verdictMultiplier(inspection) {
  const raw =
    (isRecord(inspection) && (inspection.verdict ?? inspection.option ?? inspection.decision ?? inspection.report_option)) ||
    '';
  const s = String(raw).trim().toUpperCase();
  if (s === 'C' || s.includes('OPTION C') || s === 'OPTIONC') return 1.2;
  if (s === 'A' || s.includes('OPTION A') || s === 'OPTIONA') return 0.8;
  if (s === 'B' || s.includes('OPTION B') || s === 'OPTIONB') return 1.0;
  return 1.0;
}

function leadScoreAdjustment(lead_score) {
  const n = asNumber(lead_score);
  if (n == null) return 0;
  if (n > 70) return 0.1;
  if (n < 30) return -0.1;
  return 0;
}

function clampMultiplier(m) {
  if (!Number.isFinite(m)) return 1;
  return Math.min(2.5, Math.max(0.5, m));
}

function tierForFinalPrice(final_price) {
  if (!Number.isFinite(final_price) || final_price <= 0) return 'basic';
  if (final_price > 5000) return 'premium';
  if (final_price >= 2000) return 'standard';
  return 'basic';
}

/**
 * @param {PricingStrategyInput} input
 * @returns {PricingStrategyResult}
 */
function computePricingStrategy(input = {}) {
  const repair_items = input && 'repair_items' in input ? input.repair_items : [];
  const inspection = input && 'inspection' in input ? input.inspection : {};
  const lead_score = input && 'lead_score' in input ? input.lead_score : undefined;

  const base_total = baseTotalFromRepairItems(repair_items);
  let multiplier = verdictMultiplier(inspection);
  multiplier += leadScoreAdjustment(lead_score);
  multiplier = clampMultiplier(multiplier);

  const final_price = Math.round(base_total * multiplier * 100) / 100;
  const pricing_tier = tierForFinalPrice(final_price);

  return {
    final_price,
    pricing_tier,
    margin_applied: multiplier,
  };
}

/**
 * Single recommended line-item package (replaces per-item ranges in quote copy).
 * @param {unknown} final_price
 * @returns {RecommendedQuotePackage}
 */
function buildRecommendedPackage(final_price) {
  const n = asNumber(final_price);
  const price = n != null ? Math.round(n * 100) / 100 : 0;
  return {
    package_name: 'Recommended Electrical Upgrade',
    price,
    description: 'Covers all identified electrical issues',
  };
}

module.exports = {
  computePricingStrategy,
  buildRecommendedPackage,
  baseTotalFromRepairItems,
  midPriceForItem,
  verdictMultiplier,
};
