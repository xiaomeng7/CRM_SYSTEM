/**
 * Internal CRM quick lead: account + contact + lead + opportunity + ServiceM8 job + line-specific follow-up.
 * Does not use public /api/public/leads.
 */

const { pool } = require('../lib/db');
const { emit } = require('../lib/domain-events');
const { cleanContact, cleanAccount } = require('../lib/crm/cleaning');
const { scheduleLeadScoring } = require('./lead-scoring');
const { syncIntakeAttributionFromLead } = require('./opportunities');
const { createServiceM8JobFromCRM } = require('./servicem8-create-job');
const { createServiceM8QuoteFromCRM } = require('./servicem8-create-quote');

const PRODUCT_LINES = new Set(['pre_purchase', 'rental', 'energy']);
/** Non-ad CRM intake; includes legacy values for older API clients. */
const SOURCES = new Set([
  'phone',
  'referral',
  'repeat',
  'manual',
  'other',
  'google_ads',
  'inspector',
]);

async function getTableColumns(client, tableName) {
  const r = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return new Set(r.rows.map((x) => x.column_name));
}

function mapProductLine(line) {
  const pl = String(line || '').trim().toLowerCase();
  if (!PRODUCT_LINES.has(pl)) {
    const e = new Error('product_line must be one of: pre_purchase, rental, energy');
    e.code = 'VALIDATION';
    throw e;
  }
  if (pl === 'pre_purchase') return { product_line: 'pre_purchase', product_type: 'pre_purchase' };
  if (pl === 'rental') return { product_line: 'rental', product_type: 'rental_lite' };
  return { product_line: 'energy', product_type: 'energy_advisory' };
}

/**
 * @param {object} body
 * @returns {Promise<object>}
 */
async function createLeadWithJobFromInternal(body = {}) {
  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  const address = String(body.address || '').trim() || null;
  const productLineIn = String(body.product_line || '').trim().toLowerCase();
  const source = String(body.source || '').trim().toLowerCase();
  const subSource = String(body.sub_source || '').trim() || null;

  if (!name || !phone) {
    const e = new Error('Missing required fields: name, phone');
    e.code = 'VALIDATION';
    throw e;
  }
  if (!SOURCES.has(source)) {
    const e = new Error(
      'source must be one of: phone, referral, repeat, manual, other (or legacy: google_ads, inspector)'
    );
    e.code = 'VALIDATION';
    throw e;
  }

  const mapped = mapProductLine(productLineIn);
  const cleanedContact = cleanContact({ name, phone, email: '' });
  const cleanedAccount = cleanAccount({ name, suburb: '' });
  const accName = cleanedContact.name || cleanedAccount.name || name;
  const accPhone = cleanedContact.phone || phone;

  const client = await pool.connect();
  let leadId;
  let opportunityId;
  let accountId;
  let contactId;

  try {
    await client.query('BEGIN');
    const leadCols = await getTableColumns(client, 'leads');
    const oppCols = await getTableColumns(client, 'opportunities');

    const accRes = await client.query(
      `INSERT INTO accounts (name, address_line, suburb, status, created_by)
       VALUES ($1, $2, $3, 'active', $4)
       RETURNING id`,
      [accName, address, null, 'internal-quick-lead']
    );
    accountId = accRes.rows[0].id;

    const conRes = await client.query(
      `INSERT INTO contacts (account_id, name, email, phone, status, created_by)
       VALUES ($1, $2, $3, $4, 'active', $5)
       RETURNING id`,
      [accountId, accName, null, accPhone || null, 'internal-quick-lead']
    );
    contactId = conRes.rows[0].id;

    const leadData = {
      contact_id: contactId,
      account_id: accountId,
      source,
      status: 'new',
      created_by: 'internal-quick-lead',
      product_type: mapped.product_type,
    };
    if (leadCols.has('sub_source')) leadData.sub_source = subSource;
    if (leadCols.has('product_line')) leadData.product_line = mapped.product_line;

    const lCols = Object.keys(leadData).filter((k) => leadCols.has(k));
    const lVals = lCols.map((k) => leadData[k]);
    const lPh = lCols.map((_, i) => `$${i + 1}`);
    const leadRes = await client.query(
      `INSERT INTO leads (${lCols.join(', ')}) VALUES (${lPh.join(', ')}) RETURNING *`,
      lVals
    );
    const lead = leadRes.rows[0];
    leadId = lead.id;

    const oppData = {
      account_id: accountId,
      contact_id: contactId,
      lead_id: lead.id,
      stage: 'new_inquiry',
      product_type: mapped.product_type,
      status: 'open',
      created_by: 'internal-quick-lead',
    };
    if (oppCols.has('product_line')) oppData.product_line = mapped.product_line;

    const oCols = Object.keys(oppData).filter((k) => oppCols.has(k));
    const oVals = oCols.map((k) => oppData[k]);
    const oPh = oCols.map((_, i) => `$${i + 1}`);
    const oppRes = await client.query(
      `INSERT INTO opportunities (${oCols.join(', ')}) VALUES (${oPh.join(', ')}) RETURNING id`,
      oVals
    );
    opportunityId = oppRes.rows[0].id;

    await syncIntakeAttributionFromLead(client, opportunityId, lead.id);

    await client.query(
      `INSERT INTO activities (contact_id, lead_id, opportunity_id, activity_type, summary, created_by)
       VALUES ($1, $2, $3, 'note', $4, 'internal-quick-lead')`,
      [
        contactId,
        lead.id,
        opportunityId,
        `Manual intake — source: ${source}${subSource ? ` (${subSource})` : ''}, line: ${mapped.product_line}`,
      ]
    );

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    client.release();
    throw e;
  }
  client.release();

  await emit('lead.created', 'lead', leadId, {
    lead_id: leadId,
    source,
    channel: 'internal_quick',
    product_type: mapped.product_type,
    product_line: mapped.product_line,
  });
  await emit('opportunity.created', 'opportunity', opportunityId, {
    opportunity_id: opportunityId,
    lead_id: leadId,
    stage: 'new_inquiry',
  });
  scheduleLeadScoring(leadId);

  const createReason = `Manual CRM intake — ${source}${subSource ? ` / ${subSource}` : ''} — ${mapped.product_line}`;
  const jobResult = await createServiceM8JobFromCRM(
    { opportunity_id: opportunityId, create_reason: createReason },
    { db: pool, log: () => {} }
  );

  const out = {
    ok: true,
    lead_id: leadId,
    opportunity_id: opportunityId,
    service_m8_job_id: null,
    job_create: jobResult,
    extras: {},
  };

  if (!jobResult.ok) {
    out.ok = false;
    out.error = jobResult.error || 'ServiceM8 job creation failed';
    out.error_code = jobResult.error_code || 'SERVICEM8_JOB';
    return out;
  }

  const jobUuid = jobResult.job_uuid;
  out.service_m8_job_id = jobUuid;

  try {
    if (mapped.product_line === 'pre_purchase') {
      const q = await createServiceM8QuoteFromCRM({ opportunity_id: opportunityId }, { db: pool, log: () => {} });
      out.extras.quote = q;
    } else if (mapped.product_line === 'rental') {
      const insp = await pool.query(
        `INSERT INTO inspections (opportunity_id, account_id, contact_id, inspection_type, status, address, notes, created_by)
         VALUES ($1, $2, $3, 'rental_changeover', 'scheduled', $4, $5, 'internal-quick-lead')
         RETURNING id`,
        [opportunityId, accountId, contactId, address, subSource || 'Rental inspection (manual intake)']
      );
      out.extras.inspection_id = insp.rows[0].id;
    } else {
      await pool.query(
        `INSERT INTO activities (contact_id, lead_id, opportunity_id, activity_type, summary, created_by)
         VALUES ($1, $2, $3, 'note', $4, 'internal-quick-lead')`,
        [
          contactId,
          leadId,
          opportunityId,
          'Energy advisory pipeline — manual intake; follow up for booking / advisory slot.',
        ]
      );
      out.extras.advisory_note = true;
    }
  } catch (followErr) {
    out.extras.follow_up_error = followErr.message || String(followErr);
    console.error('[internal-lead-intake] post-job follow-up failed:', followErr);
  }

  return out;
}

module.exports = {
  createLeadWithJobFromInternal,
  PRODUCT_LINES: [...PRODUCT_LINES].sort(),
  SOURCES: [...SOURCES].sort(),
};
