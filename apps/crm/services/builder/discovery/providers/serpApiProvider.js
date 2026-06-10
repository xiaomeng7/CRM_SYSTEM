/**
 * SerpAPI discovery provider (PR9B.2).
 */

const discoveryConfig = require('../../../../config/builder-discovery');
const { BaseProvider } = require('./baseProvider');
const { parseSerpApiResponse } = require('./serpApiMapping');

const SERPAPI_ENDPOINT = 'https://serpapi.com/search.json';

function isSerpApiConfigured() {
  return discoveryConfig.isSerpApiConfigured();
}

class SerpApiProvider extends BaseProvider {
  constructor(name, config = {}, options = {}) {
    super(name, config);
    this._fetch = options.fetch || global.fetch;
  }

  isEnabled() {
    return isSerpApiConfigured();
  }

  buildSearchQuery(query, location) {
    const parts = [String(query || '').trim(), location ? String(location).trim() : '']
      .filter(Boolean);
    return parts.join(' ');
  }

  async discoverBuilders({ query, location, limit }) {
    if (!isSerpApiConfigured()) {
      return this.disabledResponse('serpapi_not_configured');
    }

    const apiKey = process.env.SERPAPI_API_KEY;
    const maxResults = Math.min(
      parseInt(limit, 10) || this.config.max_results || discoveryConfig.serpapi_max_results || 20,
      discoveryConfig.serpapi_max_results || 20
    );

    const searchQ = this.buildSearchQuery(query, location);
    const params = new URLSearchParams({
      engine: 'google',
      q: searchQ,
      api_key: apiKey,
      num: String(Math.min(maxResults, 10)),
      gl: 'au',
      hl: 'en',
      location: this.config.default_location || 'Adelaide, South Australia, Australia',
    });

    let response;
    try {
      response = await this._fetch(`${SERPAPI_ENDPOINT}?${params.toString()}`);
    } catch (err) {
      return {
        ok: false,
        provider: this.name,
        reason: 'serpapi_request_failed',
        candidates: [],
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        provider: this.name,
        reason: `serpapi_http_${response.status}`,
        candidates: [],
      };
    }

    let body;
    try {
      body = await response.json();
    } catch (_) {
      return {
        ok: false,
        provider: this.name,
        reason: 'serpapi_invalid_response',
        candidates: [],
      };
    }

    if (body.error) {
      return {
        ok: false,
        provider: this.name,
        reason: 'serpapi_api_error',
        candidates: [],
      };
    }

    const candidates = parseSerpApiResponse(body, { query, location }, maxResults);
    return this.enabledResponse(candidates);
  }
}

module.exports = {
  SerpApiProvider,
  isSerpApiConfigured,
  SERPAPI_ENDPOINT,
};
