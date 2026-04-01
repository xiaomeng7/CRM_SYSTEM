/**
 * Pre-Purchase Decision Engine v1
 * Input: inspection findings array + module scores
 * Output: { verdict: 'A'|'B'|'C', risk_level: 'low'|'moderate'|'high',
 *           cost_low: number, cost_high: number,
 *           decision_options: [{option, title, description, cost_low, cost_high}],
 *           summary: string }
 *
 * Finding shape:
 *   { priority: 'IMMEDIATE'|'PRIORITY_ACTION'|'PLAN'|'ADVISORY'|'PASS',
 *     cost_low: number, cost_high: number, module: string }
 */

'use strict';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return true if the finding should contribute to cost totals.
 * PASS and ADVISORY findings are excluded.
 */
function isCostBearing(finding) {
  return finding.priority !== 'PASS' && finding.priority !== 'ADVISORY';
}

/**
 * Sum cost_low and cost_high for an array of findings.
 * @param {Array} findings
 * @returns {{ low: number, high: number }}
 */
function sumCosts(findings) {
  return findings.reduce(
    (acc, f) => ({
      low: acc.low + (Number(f.cost_low) || 0),
      high: acc.high + (Number(f.cost_high) || 0),
    }),
    { low: 0, high: 0 }
  );
}

// ---------------------------------------------------------------------------
// Verdict logic
// ---------------------------------------------------------------------------

/**
 * Determine verdict A/B/C from the findings array.
 *
 * Rules (evaluated in priority order):
 *   Verdict C  → IMMEDIATE count >= 2  OR  any finding cost_high > 10000
 *   Verdict B  → total cost_high of cost-bearing findings > 8000  OR  IMMEDIATE count == 1
 *   Verdict A  → everything else
 *
 * @param {Array} findings
 * @returns {{ verdict: 'A'|'B'|'C', immediateCount: number, totalCostHigh: number }}
 */
function determineVerdict(findings) {
  const immediateFindings = findings.filter(f => f.priority === 'IMMEDIATE');
  const immediateCount = immediateFindings.length;

  // Check if any single finding has cost_high > 10000
  const hasBigTicketItem = findings.some(f => (Number(f.cost_high) || 0) > 10000);

  // Sum cost-bearing findings for total cost check
  const costBearing = findings.filter(isCostBearing);
  const { high: totalCostHigh } = sumCosts(costBearing);

  let verdict;
  if (immediateCount >= 2 || hasBigTicketItem) {
    verdict = 'C';
  } else if (totalCostHigh > 8000 || immediateCount === 1) {
    verdict = 'B';
  } else {
    verdict = 'A';
  }

  return { verdict, immediateCount, totalCostHigh };
}

// ---------------------------------------------------------------------------
// Risk level
// ---------------------------------------------------------------------------

/**
 * Map verdict to risk level.
 * @param {'A'|'B'|'C'} verdict
 * @returns {'low'|'moderate'|'high'}
 */
function riskLevelFromVerdict(verdict) {
  switch (verdict) {
    case 'A': return 'low';
    case 'B': return 'moderate';
    case 'C': return 'high';
    default:  return 'low';
  }
}

// ---------------------------------------------------------------------------
// Decision options
// ---------------------------------------------------------------------------

/**
 * Generate the three decision options:
 *   Option A – address PRIORITY_ACTION items only (urgent safety/compliance)
 *   Option B – address PRIORITY_ACTION + PLAN items (recommended scope)
 *   Option C – Option B + 20% uplift for future-proofing / contingency
 *
 * @param {Array} findings
 * @returns {Array<{option, title, description, cost_low, cost_high}>}
 */
function buildDecisionOptions(findings) {
  const priorityAction = findings.filter(f => f.priority === 'PRIORITY_ACTION');
  const plan = findings.filter(f => f.priority === 'PLAN');

  const { low: paLow, high: paHigh } = sumCosts(priorityAction);
  const { low: planLow, high: planHigh } = sumCosts(plan);

  const optBLow  = paLow + planLow;
  const optBHigh = paHigh + planHigh;

  const UPLIFT = 1.2;

  return [
    {
      option: 'A',
      title: 'Minimum Viable Remediation',
      description:
        'Address only the priority-action items identified during inspection. ' +
        'Covers urgent safety and compliance work required before the property can be considered safe.',
      cost_low:  Math.round(paLow),
      cost_high: Math.round(paHigh),
    },
    {
      option: 'B',
      title: 'Recommended Remediation Scope',
      description:
        'Address all priority-action and planned maintenance items. ' +
        'This scope brings the installation to a fully compliant and well-maintained condition ' +
        'with no known deferred work outstanding.',
      cost_low:  Math.round(optBLow),
      cost_high: Math.round(optBHigh),
    },
    {
      option: 'C',
      title: 'Future-Proof Package',
      description:
        'Option B scope plus a 20% contingency uplift to cover unforeseen items discovered ' +
        'during remediation works, ageing infrastructure that may fail on disturbance, and ' +
        'optional minor upgrades identified in the advisory findings.',
      cost_low:  Math.round(optBLow  * UPLIFT),
      cost_high: Math.round(optBHigh * UPLIFT),
    },
  ];
}

// ---------------------------------------------------------------------------
// Summary text
// ---------------------------------------------------------------------------

/**
 * Generate a plain-English summary paragraph based on verdict and key metrics.
 *
 * @param {'A'|'B'|'C'} verdict
 * @param {number} immediateCount
 * @param {number} totalCostHigh
 * @param {number} costLow
 * @param {number} costHigh
 * @returns {string}
 */
function buildSummary(verdict, immediateCount, totalCostHigh, costLow, costHigh) {
  const fmt = n => `$${Number(n).toLocaleString('en-AU', { minimumFractionDigits: 0 })}`;

  if (verdict === 'A') {
    return (
      'The electrical installation is in generally sound condition with no immediate safety hazards ' +
      'identified. Minor advisory items have been noted for future reference but do not require ' +
      'urgent attention. Overall remediation costs are estimated at ' +
      `${fmt(costLow)}–${fmt(costHigh)}. ` +
      'This property is considered a low-risk electrical purchase.'
    );
  }

  if (verdict === 'B') {
    const immText =
      immediateCount === 1
        ? 'One immediate safety item was identified that requires attention prior to, or shortly after, settlement.'
        : 'A number of planned maintenance items have been identified that will require attention within the short to medium term.';
    return (
      `${immText} ` +
      'The installation is functional but has deficiencies that represent a moderate level of risk ' +
      `and an estimated remediation cost of ${fmt(costLow)}–${fmt(costHigh)}. ` +
      'Buyers should factor this cost into purchase negotiations or request that the vendor ' +
      'undertake the works prior to settlement.'
    );
  }

  // Verdict C
  return (
    `This inspection has identified ${immediateCount} immediate safety concern(s) and/or high-cost ` +
    'defects that represent a significant risk to the purchaser. The electrical installation requires ' +
    'substantial remediation work with an estimated cost of ' +
    `${fmt(costLow)}–${fmt(costHigh)}. ` +
    'Buyers should seek a significant price reduction, require vendor rectification prior to settlement, ' +
    'or carefully reconsider the purchase. Independent quotations are strongly recommended before proceeding.'
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Run the pre-purchase decision engine.
 *
 * @param {Array<{priority: string, cost_low: number, cost_high: number, module: string}>} findings
 * @param {Object} [moduleScores]  Optional map of module name → score (reserved for future use)
 * @returns {{
 *   verdict: 'A'|'B'|'C',
 *   risk_level: 'low'|'moderate'|'high',
 *   cost_low: number,
 *   cost_high: number,
 *   decision_options: Array,
 *   summary: string
 * }}
 */
function runDecisionEngine(findings = [], moduleScores = {}) {
  if (!Array.isArray(findings)) {
    throw new TypeError('findings must be an array');
  }

  // Normalise – ensure numeric cost fields
  const normalised = findings.map(f => ({
    priority:  String(f.priority  || 'ADVISORY').toUpperCase(),
    cost_low:  Number(f.cost_low)  || 0,
    cost_high: Number(f.cost_high) || 0,
    module:    String(f.module     || ''),
  }));

  const { verdict, immediateCount, totalCostHigh } = determineVerdict(normalised);
  const risk_level = riskLevelFromVerdict(verdict);

  // Overall costs (all cost-bearing findings)
  const costBearing = normalised.filter(isCostBearing);
  const { low: cost_low, high: cost_high } = sumCosts(costBearing);

  const decision_options = buildDecisionOptions(normalised);
  const summary = buildSummary(
    verdict,
    immediateCount,
    totalCostHigh,
    cost_low,
    cost_high
  );

  return {
    verdict,
    risk_level,
    cost_low:  Math.round(cost_low),
    cost_high: Math.round(cost_high),
    decision_options,
    summary,
  };
}

module.exports = { runDecisionEngine };
