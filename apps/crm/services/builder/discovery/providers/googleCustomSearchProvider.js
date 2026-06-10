/**
 * Google Custom Search provider — architecture stub (PR9B.1).
 */

const { BaseProvider } = require('./baseProvider');

class GoogleCustomSearchProvider extends BaseProvider {
  async discoverBuilders() {
    if (!this.isEnabled()) {
      return this.disabledResponse('provider_not_enabled');
    }

    return this.disabledResponse('search_provider_not_configured');
  }
}

module.exports = {
  GoogleCustomSearchProvider,
};
