/**
 * Public lead intake — create account/contact/lead from external forms.
 * Keeps logic minimal but records enough context for CRM to use later.
 */

const { pool } = require('../lib/db');
const { emit } = require('../lib/domain-events');
const { cleanContact, cleanAccount } = require('../lib/crm/cleaning');
const { scheduleLeadScoring } = require('./lead-scoring');

function isUuid(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim());
}

/** Strict whitelist: only these codes may resolve to source_id (no auto-upsert of unknown codes). */
const SOURCE_CODE_WHITELIST = new Set([
  'google_ads',
  'facebook_ads',
  'organic_search',
  'direct',
  'referral',
  'servicem8_import',
]);

/**
 * Map utm_source or legacy source string to a whitelist code, or null.
 * v1: keyword-based; unknown strings never create new lead_sources rows.
 */
function inferWhitelistSourceCode(val) {
  const s = String(val || '').trim().toLowerCase();
  if (!s) return null;
  const underscored = s.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (SOURCE_CODE_WHITELIST.has(underscored)) return underscored;

  const compact = s.replace(/[^a-z0-9]+/g, ' ');
  if (/google|adwords|google ads/.test(compact)) return 'google_ads';
  if (/facebook|meta|instagram|facebook ads/.test(compact)) return 'facebook_ads';
  if (/referral|referred|word of mouth/.test(compact)) return 'referral';
  if (/\b(direct|website|web)\b/.test(compact) || compact === 'direct') return 'direct';
  if (/organic|seo|organic search/.test(compact)) return 'organic_search';
  if (/servicem8/.test(compact) || /servicem8/.test(s)) return 'servicem8_import';
  return null;
}

async function getCampaignColumns(client) {
  const r = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'campaigns'`
  );
  return new Set(r.rows.map((x) => x.column_name));
}

async function getTableColumns(client, tableName) {
  const r = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return new Set(r.rows.map((x) => x.column_name));
}

/**
 * Create a lead from a public landing page submission.
 * Expected shape (minimal):
 * - name
 * - phone
 * - email
 * - suburb
 * - source
 * - service_type
 * - message
 * - raw_payload (optional) — full original body for future analysis
 *
 * Ad ROI (reliable path): pass `campaign_id` (UUID from `campaigns.id`, e.g. hidden field set per landing).
 * Fallback: `utm_campaign` exact match to `campaigns.code` or `campaigns.name` (see seeds in 034 migration).
 * UTM-only leads without `campaign_id` never join `campaign_costs` in ROI views — prefer explicit UUID.
 */
async function createFromPublic(body = {}) {
  const rawName = (body.name || '').trim();
  const rawPhone = (body.phone || '').trim();
  const rawEmail = (body.email || '').trim();
  const rawSuburb = (body.suburb || '').trim();
  const rawAddress = (body.address || '').trim();
  const source = (body.source || 'landing:advisory').trim();
  const sourceId = typeof body.source_id === 'string' ? body.source_id.trim() : null;
  const campaignId = typeof body.campaign_id === 'string' ? body.campaign_id.trim() : null;
  const creativeId = typeof body.creative_id === 'string' ? body.creative_id.trim() : null;
  const utmSource = (body.utm_source || '').trim() || null;
  const utmMedium = (body.utm_medium || '').trim() || null;
  const utmCampaign = (body.utm_campaign || '').trim() || null;
  const utmTerm = (body.utm_term || '').trim() || null;
  const utmContent = (body.utm_content || '').trim() || null;
  const clickId = (body.click_id || '').trim() || null;
  const landingPageUrl = (body.landing_page_url || '').trim() || null;
  const referrerUrl = (body.referrer_url || body._request_referrer || '').trim() || null;
  const productInterest = (body.product_interest || '').trim() || null;
  const budgetSignal = (body.budget_signal || '').trim() || null;
  const urgencyLevel = (body.urgency_level || '').trim() || null;
  const serviceType = (body.service_type || '').trim();
  const message = (body.message || '').trim() || null;
  const rawPayload = body.raw_payload && typeof body.raw_payload === 'object'
    ? body.raw_payload
    : body;

  const cleanedContact = cleanContact({
    name: rawName,
    phone: rawPhone,
    email: rawEmail,
  });

  const cleanedAccount = cleanAccount({
    name: rawName,
    suburb: rawSuburb,
  });

  const name = cleanedContact.name || cleanedAccount.name;
  const phone = cleanedContact.phone;
  const email = cleanedContact.email;
  const suburb = cleanedAccount.suburb;

  if (!name || !phone || !email || !suburb) {
    const missing = [];
    if (!name) missing.push('name');
    if (!phone) missing.push('phone');
    if (!email) missing.push('email');
    if (!suburb) missing.push('suburb');
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }

  const client = await pool.connect();
  try {
    function sanitizeUuid(name, value) {
      if (!value) return null;
      if (!isUuid(value)) {
        console.warn(`[public-leads] invalid ${name}, ignored:`, value);
        return null;
      }
      return value;
    }

    async function resolveSourceId() {
      try {
        const cleanSourceId = sanitizeUuid('source_id', sourceId);
        if (cleanSourceId) {
          const byId = await client.query(`SELECT id FROM lead_sources WHERE id = $1 LIMIT 1`, [cleanSourceId]);
          if (byId.rows[0]?.id) return byId.rows[0].id;
          console.warn('[public-leads] source_id not found in lead_sources, ignored:', cleanSourceId);
        }

        const whitelistCode = inferWhitelistSourceCode(utmSource || source);
        if (!whitelistCode) return null;

        const byCode = await client.query(`SELECT id FROM lead_sources WHERE code = $1 LIMIT 1`, [whitelistCode]);
        if (byCode.rows[0]?.id) return byCode.rows[0].id;

        console.warn(
          '[public-leads] whitelist code has no lead_sources row (seed missing?), source_id left null:',
          whitelistCode
        );
        return null;
      } catch (e) {
        if (/relation \"lead_sources\" does not exist/i.test(e.message || '')) {
          console.warn('[public-leads] lead_sources table missing, skip source_id mapping');
          return null;
        }
        throw e;
      }
    }

    async function resolveCampaignId() {
      const cleanCampaignId = sanitizeUuid('campaign_id', campaignId);
      if (cleanCampaignId) return cleanCampaignId;
      if (!utmCampaign) return null;
      try {
        const cols = await getCampaignColumns(client);
        if (cols.has('external_campaign_id')) {
          const byExternal = await client.query(
            `SELECT id FROM campaigns WHERE external_campaign_id = $1 LIMIT 1`,
            [utmCampaign]
          );
          if (byExternal.rows[0]?.id) return byExternal.rows[0].id;
        }
        if (cols.has('campaign_name')) {
          const byNameLegacy = await client.query(
            `SELECT id FROM campaigns WHERE campaign_name = $1 LIMIT 1`,
            [utmCampaign]
          );
          if (byNameLegacy.rows[0]?.id) return byNameLegacy.rows[0].id;
        }
        const byCode = await client.query(
          `SELECT id FROM campaigns WHERE code = $1 OR name = $2 LIMIT 1`,
          [utmCampaign, utmCampaign]
        );
        return byCode.rows[0]?.id || null;
      } catch (e) {
        console.warn('[public-leads] campaign resolve skipped:', e.message);
        return null;
      }
    }

    const safeCreativeId = sanitizeUuid('creative_id', creativeId);
    const mappedSourceId = await resolveSourceId();
    const mappedCampaignId = await resolveCampaignId();

    await client.query('BEGIN');

    // Create account (simple residential account; can be enriched later)
    const accountResult = await client.query(
      `INSERT INTO accounts (name, address_line, suburb, status, created_by)
       VALUES ($1, $2, $3, 'active', $4)
       RETURNING id`,
      [name, rawAddress || null, suburb || null, 'landing-page']
    );
    const accountId = accountResult.rows[0].id;

    // Create contact linked to account
    const contactResult = await client.query(
      `INSERT INTO contacts (account_id, name, email, phone, status, created_by)
       VALUES ($1, $2, $3, $4, 'active', $5)
       RETURNING id`,
      [accountId, name, email || null, phone || null, 'landing-page']
    );
    const contactId = contactResult.rows[0].id;

    // Create lead referencing contact/account
    const leadCols = await getTableColumns(client, 'leads');
    const leadData = {
      contact_id: contactId,
      account_id: accountId,
      source: source || null,
      source_id: mappedSourceId,
      campaign_id: mappedCampaignId,
      creative_id: safeCreativeId,
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      utm_term: utmTerm,
      utm_content: utmContent,
      click_id: clickId,
      landing_page_url: landingPageUrl,
      referrer_url: referrerUrl,
      product_interest: productInterest,
      budget_signal: budgetSignal,
      urgency_level: urgencyLevel,
      status: 'new',
      created_by: 'landing-page',
    };
    const cols = Object.keys(leadData).filter((k) => leadCols.has(k));
    const vals = cols.map((k) => leadData[k]);
    const placeholders = cols.map((_, i) => '$' + (i + 1));
    const leadResult = await client.query(
      `INSERT INTO leads (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
      vals
    );
    const lead = leadResult.rows[0];

    // Optional activity capturing free-text message / service type
    if (message || serviceType) {
      const summaryParts = [];
      if (serviceType) summaryParts.push(`Service type: ${serviceType}`);
      if (message) summaryParts.push(message);
      await client.query(
        `INSERT INTO activities (contact_id, lead_id, activity_type, summary, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [contactId, lead.id, 'web_form', summaryParts.join(' — '), 'landing-page']
      );
    }

    await client.query('COMMIT');

    await emit('lead.created', 'lead', lead.id, {
      lead_id: lead.id,
      source: lead.source,
      source_id: lead.source_id || null,
      campaign_id: lead.campaign_id || null,
      creative_id: lead.creative_id || null,
      utm_campaign: lead.utm_campaign || null,
      product_interest: lead.product_interest || null,
      budget_signal: lead.budget_signal || null,
      urgency_level: lead.urgency_level || null,
      service_type: serviceType || null,
      channel: 'web',
      raw_payload: rawPayload,
    });

    // Fire-and-forget: never block intake on AI scoring.
    scheduleLeadScoring(lead.id);

    return { lead, contact_id: contactId, account_id: accountId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  createFromPublic,
};

