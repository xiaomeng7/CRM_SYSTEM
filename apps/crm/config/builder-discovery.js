/**
 * Builder discovery provider configuration (PR9B.1 + PR9B.2).
 * API keys are read from env at runtime — never stored here.
 */

function isTruthyEnv(value) {
  if (value == null) return false;
  const v = String(value).trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function isSerpApiConfigured() {
  return (
    isTruthyEnv(process.env.BUILDER_DISCOVERY_SERPAPI_ENABLED) &&
    Boolean(process.env.SERPAPI_API_KEY && String(process.env.SERPAPI_API_KEY).trim())
  );
}

/** Safe runtime diagnostic — never exposes API key. */
function getSerpApiStatus() {
  const flag = process.env.BUILDER_DISCOVERY_SERPAPI_ENABLED;
  const keyPresent = Boolean(process.env.SERPAPI_API_KEY && String(process.env.SERPAPI_API_KEY).trim());
  return {
    configured: isSerpApiConfigured(),
    enable_flag_present: flag != null && String(flag).trim() !== '',
    enable_flag_truthy: isTruthyEnv(flag),
    api_key_present: keyPresent,
  };
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
  getSerpApiStatus,
  resolveProviderEnabled,
};
