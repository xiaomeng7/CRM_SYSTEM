/**
 * Web search discovery — disabled by default (PR9A).
 * Enable with BUILDER_DISCOVERY_WEB_ENABLED=true when a provider is configured.
 */

function isWebDiscoveryEnabled() {
  return process.env.BUILDER_DISCOVERY_WEB_ENABLED === 'true';
}

/**
 * @param {object} params
 * @param {string} params.query
 * @param {string} [params.location]
 */
async function runSearchEngineDiscovery({ query, location }) {
  if (!isWebDiscoveryEnabled()) {
    return {
      ok: false,
      reason: 'web_discovery_disabled',
      candidates: [],
      total_found: 0,
    };
  }

  // PR9B: integrate a proper search API provider here.
  return {
    ok: false,
    reason: 'search_provider_not_configured',
    candidates: [],
    total_found: 0,
  };
}

module.exports = {
  isWebDiscoveryEnabled,
  runSearchEngineDiscovery,
};
