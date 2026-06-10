/**
 * Web search discovery — delegates to SerpAPI provider stub (PR9B.1).
 * @deprecated use runDiscovery({ source: 'serpapi', ... })
 */

const { isSerpApiConfigured } = require('./providers/serpApiProvider');
const { runDiscovery } = require('./runDiscovery');

function isWebDiscoveryEnabled() {
  return isSerpApiConfigured();
}

async function runSearchEngineDiscovery({ query, location }) {
  const result = await runDiscovery({
    source: 'serpapi',
    query,
    location,
  });

  if (!result.ok && (result.reason === 'provider_not_enabled' || result.reason === 'serpapi_not_configured')) {
    return {
      ok: false,
      reason: result.reason === 'serpapi_not_configured' ? 'serpapi_not_configured' : 'web_discovery_disabled',
      candidates: [],
      total_found: 0,
    };
  }

  return {
    ok: result.ok,
    reason: result.reason,
    provider: result.provider,
    candidates: result.candidates || [],
    total_found: result.total_found || 0,
  };
}

module.exports = {
  isWebDiscoveryEnabled,
  runSearchEngineDiscovery,
};
