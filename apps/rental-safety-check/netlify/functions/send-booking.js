/**
 * Rental Safety Check — Booking / Lead submission handler
 *
 * POST /.netlify/functions/send-booking
 * Body: { name, phone, email, suburb, property_type, last_inspection, issues, property_count, utm_source, utm_medium, utm_campaign }
 *
 * Actions:
 *  1. Validate required fields
 *  2. Send notification email to BHT via Resend
 *  3. Push lead to CRM API (product_type: rental)
 */

'use strict';

const { Resend } = require('resend');

const RESEND_API_KEY      = process.env.RESEND_API_KEY;
const TO_EMAIL            = process.env.BOOKING_TO_EMAIL  || 'info@bhtechnology.com.au';
const FROM_EMAIL          = process.env.PDF_FROM_EMAIL    || 'onboarding@resend.dev';
const FROM_NAME           = process.env.PDF_FROM_NAME     || 'Better Home Technology';
const CRM_API_URL         = process.env.CRM_API_URL       || 'https://crmsystem-production-70c2.up.railway.app';

function esc(s) { return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function buildEmailText(b) {
  const lines = [
    `New rental inspection enquiry from the website.`,
    ``,
    `Name:              ${b.name}`,
    `Phone:             ${b.phone}`,
    `Email:             ${b.email}`,
    `Suburb / Address:  ${b.suburb || '(not provided)'}`,
    ``,
    `Property type:     ${b.property_type || '(not specified)'}`,
    `Properties owned:  ${b.property_count || '(not specified)'}`,
    `Last inspection:   ${b.last_inspection || '(not specified)'}`,
    `Reported issues:   ${Array.isArray(b.issues) ? b.issues.join(', ') : (b.issues || 'none')}`,
    ``,
    `UTM source:        ${b.utm_source  || '—'}`,
    `UTM medium:        ${b.utm_medium  || '—'}`,
    `UTM campaign:      ${b.utm_campaign || '—'}`,
    ``,
    `— Rental Safety Check landing page`,
  ];
  return lines.join('\n');
}

function buildEmailHtml(b) {
  const rows = [
    ['Name',             esc(b.name)],
    ['Phone',            esc(b.phone)],
    ['Email',            `<a href="mailto:${esc(b.email)}">${esc(b.email)}</a>`],
    ['Suburb / Address', esc(b.suburb || '—')],
    ['Property type',    esc(b.property_type || '—')],
    ['Properties owned', esc(b.property_count || '—')],
    ['Last inspection',  esc(b.last_inspection || '—')],
    ['Reported issues',  esc(Array.isArray(b.issues) ? b.issues.join(', ') : (b.issues || 'none'))],
    ['UTM source',       esc(b.utm_source  || '—')],
    ['UTM medium',       esc(b.utm_medium  || '—')],
    ['UTM campaign',     esc(b.utm_campaign || '—')],
  ];
  const tableRows = rows.map(([k, v]) =>
    `<tr><td style="padding:6px 12px;color:#6b7280;white-space:nowrap;">${k}</td><td style="padding:6px 12px;">${v}</td></tr>`
  ).join('\n');
  return `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111;">
  <h2 style="margin:0 0 16px;font-size:20px;">New Rental Inspection Enquiry</h2>
  <table style="border-collapse:collapse;width:100%;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    ${tableRows}
  </table>
  <p style="margin-top:16px;font-size:13px;color:#9ca3af;">Via rental-safety-check landing page</p>
</div>`;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const name  = (body.name  || '').trim();
  const phone = (body.phone || '').trim();
  const email = (body.email || '').trim();

  if (!name || !phone || !email) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Name, phone and email are required' }) };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid email address' }) };
  }

  const errors = [];

  // 1. Send notification email
  if (!RESEND_API_KEY) {
    console.warn('[rental-booking] RESEND_API_KEY not set — skipping email');
  } else {
    try {
      const resend = new Resend(RESEND_API_KEY);
      const result = await resend.emails.send({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: TO_EMAIL,
        replyTo: email,
        subject: `[Rental Inspection] New enquiry — ${name}`,
        text: buildEmailText({ ...body, name, phone, email }),
        html: buildEmailHtml({ ...body, name, phone, email }),
      });
      if (result.error) {
        console.error('[rental-booking] Resend error:', result.error);
        errors.push('email');
      }
    } catch (err) {
      console.error('[rental-booking] Email send failed:', err.message);
      errors.push('email');
    }
  }

  // 2. Push lead to CRM
  try {
    const crmPayload = {
      name,
      phone,
      email,
      source:       'landing:rental',
      product_type: 'rental',
      status:       'new',
      // suburb is required by CRM public-leads; fall back to 'SA' if not provided
      suburb:       (body.suburb || '').trim() || 'SA',
      // CRM service reads 'message' for activity creation
      message:      [
        body.property_type   && `Role: ${body.property_type}`,
        body.property_count  && `Properties: ${body.property_count}`,
        body.last_inspection && `Last inspection: ${body.last_inspection}`,
        body.issues && (Array.isArray(body.issues) ? body.issues.length : body.issues) &&
          `Issues: ${Array.isArray(body.issues) ? body.issues.join(', ') : body.issues}`,
      ].filter(Boolean).join(' | ') || null,
      utm_source:   body.utm_source   || null,
      utm_medium:   body.utm_medium   || null,
      utm_campaign: body.utm_campaign || null,
    };

    const crmRes = await fetch(`${CRM_API_URL}/api/public/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(crmPayload),
    });
    if (!crmRes.ok) {
      const txt = await crmRes.text().catch(() => '');
      console.warn('[rental-booking] CRM push failed:', crmRes.status, txt);
      errors.push('crm');
    }
  } catch (err) {
    console.warn('[rental-booking] CRM push error:', err.message);
    errors.push('crm');
  }

  // Respond success even if CRM/email had non-critical errors — lead was captured
  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, warnings: errors.length ? errors : undefined }),
  };
};
