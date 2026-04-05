/**
 * Public lead intake — create account/contact/lead from external forms.
 * Keeps logic minimal but records enough context for CRM to use later.
 */

const { pool } = require('../lib/db');
const { emit } = require('../lib/domain-events');
const { cleanContact, cleanAccount } = require('../lib/crm/cleaning');
const { scheduleLeadScoring } = require('./lead-scoring');
const { scheduleLeadCreatedAttribution } = require('./leadAttribution');
const { syncIntakeAttributionFromLead } = require('./opportunities');

function isUuid(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim());
}

/** Aligns with inspectors.source_code: lowercase [a-z0-9_], max 128. */
function sanitizeSubSource(v) {
  const s = String(v || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!s || s.length > 128 || !/^[a-z][a-z0-9_]*$/.test(s)) return null;
  return s;
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
 * - landing_page_version / creative_version (optional) — from URL lpv / cv; also merged into attribution raw_payload_json
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
  let source = (body.source || 'landing:advisory').trim();
  const subSourceRaw = sanitizeSubSource(body.sub_source ?? body.sub);
  if (String(source).trim().toLowerCase() === 'inspector') {
    source = 'inspector';
    if (!subSourceRaw) {
      throw new Error('sub_source (or sub) is required when source is inspector');
    }
  }
  const subSource = source === 'inspector' ? subSourceRaw : null;
  const sourceId = typeof body.source_id === 'string' ? body.source_id.trim() : null;
  const campaignId = typeof body.campaign_id === 'string' ? body.campaign_id.trim() : null;
  const creativeId = typeof body.creative_id === 'string' ? body.creative_id.trim() : null;
  const landingVariantId = typeof body.landing_variant_id === 'string' ? body.landing_variant_id.trim() : null;
  const utmSource = (body.utm_source || '').trim() || null;
  const utmMedium = (body.utm_medium || '').trim() || null;
  const utmCampaign = (body.utm_campaign || '').trim() || null;
  const utmTerm = (body.utm_term || '').trim() || null;
  const utmContent = (body.utm_content || '').trim() || null;
  const landingPageVersion = (body.landing_page_version || '').trim() || null;
  const creativeVersion = (body.creative_version || '').trim() || null;
  const clickId = (body.click_id || '').trim() || null;
  const gclid = (body.gclid || '').trim() || null;
  const landingPageUrl = (body.landing_page_url || '').trim() || null;
  const referrerUrl = (body.referrer_url || body._request_referrer || '').trim() || null;
  const productInterest = (body.product_interest || '').trim() || null;
  const productType = (body.product_type || '').trim() || null;
  const budgetSignal = (body.budget_signal || '').trim() || null;
  const urgencyLevel = (body.urgency_level || '').trim() || null;
  const serviceType = (body.service_type || body.product_type || '').trim();
  const message = (body.message || '').trim() || null;
  const rawPayload =
    body.raw_payload && typeof body.raw_payload === 'object' && !Array.isArray(body.raw_payload)
      ? { ...body.raw_payload }
      : { ...body };
  if (landingPageVersion) rawPayload.landing_page_version = landingPageVersion;
  if (creativeVersion) rawPayload.creative_version = creativeVersion;

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

    async function resolveLandingVariantId() {
      const cleanId = sanitizeUuid('landing_variant_id', landingVariantId);
      if (!cleanId) return null;
      try {
        const hit = await client.query(
          `SELECT id FROM landing_page_variants WHERE id = $1::uuid LIMIT 1`,
          [cleanId]
        );
        if (hit.rows[0]?.id) return hit.rows[0].id;
        console.warn('[public-leads] landing_variant_id not found, ignored:', cleanId);
        return null;
      } catch (e) {
        if (/relation .*landing_page_variants.* does not exist/i.test(e.message || '')) {
          console.warn('[public-leads] landing_page_variants table missing, skip landing_variant_id mapping');
          return null;
        }
        throw e;
      }
    }

    const safeCreativeId = sanitizeUuid('creative_id', creativeId);
    const mappedSourceId = await resolveSourceId();
    const mappedCampaignId = await resolveCampaignId();
    const mappedLandingVariantId = await resolveLandingVariantId();

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
      sub_source: subSource || null,
      source_id: mappedSourceId,
      campaign_id: mappedCampaignId,
      creative_id: safeCreativeId,
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      utm_term: utmTerm,
      utm_content: utmContent,
      landing_page_version: landingPageVersion,
      creative_version: creativeVersion,
      click_id: clickId,
      gclid,
      landing_variant_id: mappedLandingVariantId,
      landing_page_url: landingPageUrl,
      referrer_url: referrerUrl,
      product_interest: productInterest,
      product_type: productType,
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

    scheduleLeadCreatedAttribution(pool, {
      leadId: lead.id,
      contactId,
      accountId,
      campaignId: lead.campaign_id || null,
      creativeId: lead.creative_id || null,
      landingVariantId: lead.landing_variant_id || mappedLandingVariantId || null,
      clickId: lead.click_id || clickId || null,
      gclid: lead.gclid || gclid || null,
      landingPageUrl: lead.landing_page_url || landingPageUrl || null,
      referrerUrl: lead.referrer_url || referrerUrl || null,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
      sourceLabel: source,
      rawPayload,
    });

    // Fire-and-forget: auto Opportunity + Task + Confirmation SMS (never blocks intake)
    setImmediate(async () => {
      try {
        // 1. Create Opportunity
        const oppResult = await pool.query(
          `INSERT INTO opportunities (account_id, contact_id, lead_id, stage, product_type, status, created_by)
           VALUES ($1, $2, $3, 'new_enquiry', $4, 'open', 'landing-page') RETURNING id`,
          [accountId, contactId, lead.id, productType || serviceType || null]
        );
        const oppId = oppResult.rows[0].id;
        await syncIntakeAttributionFromLead(pool, oppId, lead.id);

        // 2. Create follow-up task due in 4 hours
        await pool.query(
          `INSERT INTO tasks (contact_id, lead_id, opportunity_id, title, due_at, status, assigned_to, created_by)
           VALUES ($1, $2, $3, $4, NOW() + INTERVAL '4 hours', 'open', 'meng', 'auto-intake')`,
          [contactId, lead.id, oppId,
           `📞 Call back — ${name} (${productType || serviceType || 'enquiry'})`]
        );

        // 3. Confirmation SMS
        const { sendSMS } = require('@bht/integrations');
        const firstName = name.split(' ')[0] || name;
        let smsBody;
        if (productType === 'pre_purchase') {
          smsBody = `Hi ${firstName}, thanks for booking a pre-purchase electrical inspection with Better Home Technology. We'll be in touch within 2 hours to confirm your inspection time. Questions? Call 0410 323 034. – Meng`;
        } else if (productType === 'rental_lite') {
          smsBody = `Hi ${firstName}, thanks for your rental inspection enquiry with Better Home Technology. We'll contact you shortly to confirm details. Questions? Call 0410 323 034. – Meng`;
        } else if (productType === 'energy_audit' || serviceType === 'energy_audit') {
          smsBody = `Hi ${firstName}, thanks for your energy advisory enquiry with Better Home Technology. We'll be in touch shortly. Questions? Call 0410 323 034. – Meng`;
        } else {
          smsBody = `Hi ${firstName}, thanks for contacting Better Home Technology. We'll be in touch soon. Questions? Call 0410 323 034. – Meng`;
        }

        if (phone && smsBody) {
          await sendSMS(phone, smsBody);
          await pool.query(
            `INSERT INTO activities (contact_id, lead_id, activity_type, summary, created_by, occurred_at)
             VALUES ($1, $2, 'outbound_sms', $3, 'auto-intake', NOW())`,
            [contactId, lead.id, `Confirmation SMS sent: ${smsBody.substring(0, 120)}`]
          );
        }
      } catch (autoErr) {
        console.error('[public-leads] auto-intake actions failed:', autoErr.message);
      }
    });

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

