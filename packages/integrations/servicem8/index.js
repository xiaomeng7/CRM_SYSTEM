/**
 * ServiceM8 API Client
 * @see https://developer.servicem8.com/docs/rest-overview
 */

const fetch = require('node-fetch');

const BASE_URL = 'https://api.servicem8.com/api_1.0';

class ServiceM8Client {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.SERVICEM8_API_KEY;
    if (!this.apiKey) {
      throw new Error('SERVICEM8_API_KEY is required');
    }
  }

  _headers() {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
    };
  }

  async getCompanies() {
    const url = `${BASE_URL}/company.json`;
    const res = await fetch(url, { headers: this._headers() });
    if (!res.ok) {
      throw new Error(`ServiceM8 API error: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  async getJobs(filter = '') {
    let url = `${BASE_URL}/job.json`;
    if (filter) {
      url += `?$filter=${encodeURIComponent(filter)}`;
    }
    const res = await fetch(url, { headers: this._headers() });
    if (!res.ok) {
      throw new Error(`ServiceM8 API error: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  async getCompany(uuid) {
    const url = `${BASE_URL}/company/${uuid}.json`;
    const res = await fetch(url, { headers: this._headers() });
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`ServiceM8 API error: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  async getJob(uuid) {
    const url = `${BASE_URL}/job/${uuid}.json`;
    const res = await fetch(url, { headers: this._headers() });
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`ServiceM8 API error: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }
}

module.exports = { ServiceM8Client };
