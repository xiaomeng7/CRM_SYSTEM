/**
 * Manual seed discovery — delegates to provider pipeline (PR9B.1).
 * @deprecated use runDiscovery({ source: 'manual_seed', ... })
 */

const { runDiscovery } = require('./runDiscovery');

async function runManualSeedDiscovery({ query, location, seed_candidates = [] }) {
  const result = await runDiscovery({
    source: 'manual_seed',
    query,
    location,
    seed_candidates,
  });
  return {
    ok: result.ok,
    source: 'manual_seed',
    provider: result.provider,
    reason: result.reason,
    candidates: result.candidates || [],
    total_found: result.total_found || 0,
  };
}

module.exports = {
  runManualSeedDiscovery,
};
