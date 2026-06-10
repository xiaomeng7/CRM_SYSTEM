/**
 * Builder discovery provider configuration (PR9B.1 + PR9B.2).
 * API keys are read from env at runtime — never stored here.
 */

function isSerpApiConfigured() {
  return (
    process.env.BUILDER_DISCOVERY_SERPAPI_ENABLED === 'true' &&
    Boolean(process.env.SERPAPI_API_KEY && String(process.env.SERPAPI_API_KEY).trim())
  );
}

function resolveProviderEnabled(name) {
  if (name === 'manual_seed') return true;
  if (name === 'serpapi') return isSerpApiConfigured();
  return false;
}

module.exports = {
  providers: {
    manual_seed: {
      enabled: true,
    },
    serpapi: {
      enabled: false,
      enable_flag_env: 'BUILDER_DISCOVERY_SERPAPI_ENABLED',
      api_key_env: 'SERPAPI_API_KEY',
      max_results: 20,
      default_location: 'Adelaide, South Australia, Australia',
    },
    google_custom_search: {
      enabled: false,
      api_key_env: 'GOOGLE_SEARCH_API_KEY',
      search_engine_id_env: 'GOOGLE_SEARCH_ENGINE_ID',
    },
    bing: {
      enabled: false,
      api_key_env: 'BING_SEARCH_API_KEY',
    },
    industry_directory: {
      enabled: false,
    },
  },
  default_limit: 25,
  serpapi_max_results: 20,
  isSerpApiConfigured,
  resolveProviderEnabled,
};
