/**
 * Discovery provider registry (PR9B.1).
 */

const discoveryConfig = require('../../../../config/builder-discovery');
const { ManualSeedProvider } = require('./manualSeedProvider');
const { SerpApiProvider, isSerpApiConfigured } = require('./serpApiProvider');
const { GoogleCustomSearchProvider } = require('./googleCustomSearchProvider');
const { BingProvider } = require('./bingProvider');
const { IndustryDirectoryProvider } = require('./industryDirectoryProvider');

const PROVIDER_SOURCES = [
  'manual_seed',
  'serpapi',
  'google_custom_search',
  'bing',
  'industry_directory',
];

const SOURCE_ALIASES = {
  web_disabled: 'serpapi',
  search_engine: 'serpapi',
  bing_search: 'bing',
  website_directory: 'industry_directory',
};

function buildRegistry() {
  const cfg = discoveryConfig.providers || {};
  return {
    manual_seed: new ManualSeedProvider('manual_seed', cfg.manual_seed || {}),
    serpapi: new SerpApiProvider('serpapi', cfg.serpapi || {}),
    google_custom_search: new GoogleCustomSearchProvider(
      'google_custom_search',
      cfg.google_custom_search || {}
    ),
    bing: new BingProvider('bing', cfg.bing || {}),
    industry_directory: new IndustryDirectoryProvider(
      'industry_directory',
      cfg.industry_directory || {}
    ),
  };
}

const registry = buildRegistry();

function normalizeProviderSource(source) {
  const raw = String(source || 'manual_seed').trim();
  return SOURCE_ALIASES[raw] || raw;
}

function getProvider(source) {
  const key = normalizeProviderSource(source);
  const provider = registry[key];
  if (!provider) {
    const err = new Error(`Unknown discovery provider: ${source}`);
    err.code = 'INVALID_INPUT';
    throw err;
  }
  return provider;
}

function listProviders() {
  return PROVIDER_SOURCES.map((name) => {
    const provider = registry[name];
    const config = discoveryConfig.providers[name] || {};
    let enabled = provider ? provider.isEnabled() : false;
    if (name === 'serpapi') {
      enabled = isSerpApiConfigured();
    } else if (name === 'manual_seed') {
      enabled = true;
    } else {
      enabled = discoveryConfig.resolveProviderEnabled(name);
    }
    return {
      value: name,
      label: name.replace(/_/g, ' '),
      enabled,
      api_key_env: config.api_key_env || null,
    };
  });
}

function getProviderConfig(source) {
  const key = normalizeProviderSource(source);
  return discoveryConfig.providers[key] || {};
}

module.exports = {
  PROVIDER_SOURCES,
  SOURCE_ALIASES,
  registry,
  normalizeProviderSource,
  getProvider,
  listProviders,
  getProviderConfig,
  buildRegistry,
};
