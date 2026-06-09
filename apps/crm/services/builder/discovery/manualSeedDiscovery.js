/**
 * Manual seed discovery — founder-provided candidate list (PR9A).
 */

const { normalizeBuilderCandidate } = require('./normalizeBuilderCandidate');

/**
 * @param {object} params
 * @param {string} params.query
 * @param {string} [params.location]
 * @param {Array<object>} [params.seed_candidates]
 */
function runManualSeedDiscovery({ query, location, seed_candidates = [] }) {
  if (!Array.isArray(seed_candidates)) {
    const err = new Error('seed_candidates must be an array');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const context = { query, location };
  const candidates = seed_candidates.map((row) => normalizeBuilderCandidate(row, context));

  return {
    ok: true,
    source: 'manual_seed',
    candidates,
    total_found: candidates.length,
  };
}

module.exports = {
  runManualSeedDiscovery,
};
