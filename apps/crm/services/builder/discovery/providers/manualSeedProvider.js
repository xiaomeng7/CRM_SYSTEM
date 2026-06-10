/**
 * Manual seed discovery provider (PR9B.1).
 */

const { BaseProvider, mapRawCandidate } = require('./baseProvider');

class ManualSeedProvider extends BaseProvider {
  async discoverBuilders({ query, location, seed_candidates = [] }) {
    if (!this.isEnabled()) {
      return this.disabledResponse();
    }
    if (!Array.isArray(seed_candidates)) {
      const err = new Error('seed_candidates must be an array');
      err.code = 'INVALID_INPUT';
      throw err;
    }

    const candidates = seed_candidates.map((row) => {
      if (!row || !row.company_name) {
        const err = new Error('Each seed candidate requires company_name');
        err.code = 'INVALID_INPUT';
        throw err;
      }
      return mapRawCandidate(row, {
        location,
        source_name: row.source_name || 'manual_seed',
      });
    });

    return this.enabledResponse(candidates);
  }
}

module.exports = {
  ManualSeedProvider,
};
