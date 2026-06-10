/**
 * Base discovery provider contract (PR9B.1).
 */

class BaseProvider {
  constructor(name, config = {}) {
    this.name = name;
    this.config = config;
  }

  isEnabled() {
    return this.config.enabled === true;
  }

  /**
   * @param {object} _params
   * @param {string} _params.query
   * @param {string} [_params.location]
   * @param {number} [_params.limit]
   * @returns {Promise<{ ok: boolean, provider: string, candidates: object[], reason?: string }>}
   */
  async discoverBuilders(_params) {
    throw new Error(`${this.name} must implement discoverBuilders()`);
  }

  disabledResponse(reason = 'provider_not_enabled') {
    return {
      ok: false,
      provider: this.name,
      reason,
      candidates: [],
    };
  }

  enabledResponse(candidates) {
    return {
      ok: true,
      provider: this.name,
      candidates: candidates || [],
    };
  }
}

function assertProviderResult(result, providerName) {
  if (!result || typeof result !== 'object') {
    throw new Error(`Provider ${providerName} returned invalid result`);
  }
  if (typeof result.ok !== 'boolean') {
    throw new Error(`Provider ${providerName} result must include ok: boolean`);
  }
  if (result.provider !== providerName) {
    throw new Error(`Provider ${providerName} result.provider mismatch`);
  }
  if (!Array.isArray(result.candidates)) {
    throw new Error(`Provider ${providerName} result must include candidates array`);
  }
  return result;
}

function mapRawCandidate(row, defaults = {}) {
  return {
    company_name: row.company_name,
    website: row.website || null,
    phone: row.phone || null,
    email: row.email || null,
    location: row.location || defaults.location || null,
    source_url: row.source_url || null,
    source_name: row.source_name || defaults.source_name || null,
    raw: row.raw != null ? row.raw : row,
  };
}

module.exports = {
  BaseProvider,
  assertProviderResult,
  mapRawCandidate,
};
