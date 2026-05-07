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

  /**
   * Fetch job quotes. ServiceM8 may expose jobquote.json or quote.json.
   * Returns [] if endpoint is not available (404/400/401 - e.g. not authorised).
   */
  async getJobQuotes(filter = '') {
    const endpoints = ['jobquote.json', 'quote.json'];
    for (const ep of endpoints) {
      try {
        let url = `${BASE_URL}/${ep}`;
        if (filter) url += `?$filter=${encodeURIComponent(filter)}`;
        const res = await fetch(url, { headers: this._headers() });
        if (res.ok) return res.json();
        if ([400, 401, 404].includes(res.status)) continue;
        throw new Error(`ServiceM8 API error: ${res.status} ${await res.text()}`);
      } catch (e) {
        if (/404|400|401|not found|unauthorized|not an authorised/i.test(e.message)) continue;
        throw e;
      }
    }
    return [];
  }

  /**
   * Create a quote in ServiceM8 linked to a job.
   * Tries jobquote.json first (job_uuid required); falls back to quote.json if needed.
   * @param {string} jobUuid - ServiceM8 job UUID
   * @param {Object} opts - { amount?, total?, description?, note? }
   * @returns {{ uuid: string }}
   */
  async createQuote(jobUuid, opts = {}) {
    const amount = opts.amount != null ? Number(opts.amount) : opts.total != null ? Number(opts.total) : null;
    const body = {
      job_uuid: jobUuid,
      total: amount != null ? amount : 0,
      note: (opts.note || opts.description || '').trim() || 'Quote created from CRM',
    };
    if (amount != null) body.amount = amount;
    const endpoints = ['jobquote.json', 'quote.json'];
    for (const ep of endpoints) {
      try {
        const url = `${BASE_URL}/${ep}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: this._headers(),
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`ServiceM8 API error: ${res.status} ${text}`);
        }
        const uuid = res.headers.get('x-record-uuid') || res.headers.get('X-Record-UUID');
        let data = {};
        const text = await res.text();
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (_) {}
        }
        const returnedUuid = data.uuid || data.UUID || uuid;
        if (!returnedUuid) throw new Error('ServiceM8 quote creation did not return uuid');
        return { uuid: returnedUuid };
      } catch (e) {
        if (ep === 'quote.json') throw e;
        if (/404|400|401|not found|method not allowed/i.test(e.message)) continue;
        throw e;
      }
    }
    throw new Error('ServiceM8 quote creation not available (jobquote/quote endpoint)');
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

  /**
   * Create a job in ServiceM8.
   * @param {string} companyUuid - ServiceM8 company UUID
   * @param {Object} opts - { job_address?, job_description?, status? }
   * @returns {{ uuid: string, job_number?: string }}
   */
  async createJob(companyUuid, opts = {}) {
    const url = `${BASE_URL}/job.json`;
    const body = {
      company_uuid: companyUuid,
      job_address: (opts.job_address || '').trim() || 'Address not provided',
      job_description: (opts.job_description || '').trim() || 'Job created from CRM',
      status: (opts.status || '').trim() || 'Quote',
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ServiceM8 API error: ${res.status} ${text}`);
    }
    const uuid = res.headers.get('x-record-uuid') || res.headers.get('X-Record-UUID');
    let data = {};
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (_) {}
    }
    const returnedUuid = data.uuid || data.UUID || uuid;
    const jobNumber = data.generated_job_id ?? data.job_number ?? data.generated_job_number;
    if (!returnedUuid) throw new Error('ServiceM8 job creation did not return uuid');
    return { uuid: returnedUuid, job_number: jobNumber != null ? String(jobNumber) : undefined };
  }

  /**
   * Create an invoice in ServiceM8 for a given job.
   * @param {string} jobUuid - ServiceM8 job UUID
   * @param {Object} opts - { amount, description?, status? }
   * @returns {{ uuid: string }}
   */
  async createInvoice(jobUuid, opts = {}) {
    const url = `${BASE_URL}/invoice.json`;
    const body = {
      job_uuid: jobUuid,
      amount: opts.amount != null ? Number(opts.amount) : 0,
      note: (opts.description || opts.note || '').trim() || 'Inspection invoice',
      status: opts.status || 'Draft',
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ServiceM8 createInvoice error: ${res.status} ${text}`);
    }
    const uuid = res.headers.get('x-record-uuid') || res.headers.get('X-Record-UUID');
    let data = {};
    const text = await res.text();
    if (text) { try { data = JSON.parse(text); } catch (_) {} }
    const returnedUuid = data.uuid || data.UUID || uuid;
    if (!returnedUuid) throw new Error('ServiceM8 invoice creation did not return uuid');
    return { uuid: returnedUuid };
  }

  /**
   * Get invoice by UUID.
   */
  async getInvoice(uuid) {
    const url = `${BASE_URL}/invoice/${uuid}.json`;
    const res = await fetch(url, { headers: this._headers() });
    if (!res.ok) throw new Error(`ServiceM8 getInvoice error: ${res.status}`);
    return res.json();
  }

  /**
   * Get invoices for a specific job.
   */
  async getJobInvoices(jobUuid) {
    return this.getInvoices(`job_uuid eq '${jobUuid}'`);
  }
}

module.exports = { ServiceM8Client };
