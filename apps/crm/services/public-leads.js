/**
 * Public lead intake — create account/contact/lead from external forms.
 * Keeps logic minimal but records enough context for CRM to use later.
 */

const { pool } = require('../lib/db');
const { emit } = require('../lib/domain-events');
const { cleanContact, cleanAccount } = require('../lib/crm/cleaning');

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
 */
async function createFromPublic(body = {}) {
  const rawName = (body.name || '').trim();
  const rawPhone = (body.phone || '').trim();
  const rawEmail = (body.email || '').trim();
  const rawSuburb = (body.suburb || '').trim();
  const source = (body.source || 'landing:advisory').trim();
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
    await client.query('BEGIN');

    // Create account (simple residential account; can be enriched later)
    const accountResult = await client.query(
      `INSERT INTO accounts (name, suburb, status, created_by)
       VALUES ($1, $2, 'active', $3)
       RETURNING id`,
      [name, suburb || null, 'landing-page']
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
    const leadResult = await client.query(
      `INSERT INTO leads (contact_id, account_id, source, status, created_by)
       VALUES ($1, $2, $3, 'new', $4)
       RETURNING *`,
      [contactId, accountId, source || null, 'landing-page']
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
      service_type: serviceType || null,
      channel: 'web',
      raw_payload: rawPayload,
    });

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

