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

  async getCompanies(filter = '') {
    let url = `${BASE_URL}/company.json`;
    if (filter) url += `?$filter=${encodeURIComponent(filter)}`;
    const res = await fetch(url, { headers: this._headers() });
    if (!res.ok) {
      throw new Error(`ServiceM8 API error: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  /**
   * Create a company (client) in ServiceM8.
   * @param {Object} body - e.g. { name, address_1, city, ... } per ServiceM8 API
   * @returns {{ uuid: string, body: object }} - uuid from x-record-uuid header or response, body is parsed response
   */
  async createCompany(body) {
    const url = `${BASE_URL}/company.json`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`ServiceM8 API error: ${res.status} ${await res.text()}`);
    }
    const uuid = res.headers.get('x-record-uuid') || (res.headers.get('X-Record-UUID'));
    let data = {};
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (_) {}
    }
    const returnedUuid = data.uuid || data.UUID || uuid;
    return { uuid: returnedUuid || uuid, body: data };
  }

  /** Fetch contacts from contact.json (client contacts; company_uuid links to company). */
  async getContacts(filter = '') {
    let url = `${BASE_URL}/contact.json`;
    if (filter) url += `?$filter=${encodeURIComponent(filter)}`;
    const res = await fetch(url, { headers: this._headers() });
    if (!res.ok) throw new Error(`ServiceM8 API error: ${res.status} ${await res.text()}`);
    return res.json();
  }

  /** Fallback: companycontact.json when contact.json is not authorised. Same auth as company. */
  async getCompanyContacts() {
    const url = `${BASE_URL}/companycontact.json`;
    const res = await fetch(url, { headers: this._headers() });
    if (!res.ok) throw new Error(`ServiceM8 API error: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async getJobs(filter = '') {
    let url = `${BASE_URL}/job.json`;
    if (filter) url += `?$filter=${encodeURIComponent(filter)}`;
    const res = await fetch(url, { headers: this._headers() });
    if (!res.ok) throw new Error(`ServiceM8 API error: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async getInvoices(filter = '') {
    let url = `${BASE_URL}/invoice.json`;
    if (filter) url += `?$filter=${encodeURIComponent(filter)}`;
    const res = await fetch(url, { headers: this._headers() });
    if (!res.ok) throw new Error(`ServiceM8 API error: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async getJobMaterials(filter = '') {
    let url = `${BASE_URL}/jobmaterial.json`;
    if (filter) url += `?$filter=${encodeURIComponent(filter)}`;
    const res = await fetch(url, { headers: this._headers() });
    if (!res.ok) throw new Error(`ServiceM8 API error: ${res.status} ${await res.text()}`);
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
