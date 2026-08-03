import type { Handler, HandlerEvent } from '@netlify/functions';
import importPlan from '../../../../packages/product-os/generated/import-plan-v2.07.json';

type Selection = { code: string; name: string; quantity: number; unitPrice: number };
type PriceFact = { name: string; price: number };

const authoritativePriceEntries: Array<[string, PriceFact]> = [
  ...importPlan.prices
    .filter((price) => price.customerVisible)
    .map((price): [string, PriceFact] => [price.productCode, { name: importPlan.products.find((product) => product.productCode === price.productCode)?.canonicalName || price.productCode, price: price.customerPriceInclGst }]),
  ...importPlan.addons
    .filter((addon) => addon.eligibilityStatus === 'ELIGIBLE')
    .map((addon): [string, PriceFact] => [addon.productCode, { name: addon.canonicalName, price: addon.customerPriceInclGst }]),
];
const authoritativePrices = new Map<string, PriceFact>(authoritativePriceEntries);
const addonParents = new Map(
  importPlan.addons
    .filter((addon) => addon.eligibilityStatus === 'ELIGIBLE')
    .map((addon) => [addon.productCode, addon.parentProductCodes])
);
const compatibleRoomCodes: Record<string, string[]> = {
  'E-01': ['C-02', 'C-03', 'C-04', 'C-05'],
  'E-03': ['C-02', 'C-03', 'C-04'],
};

function cleanText(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validSelections(value: unknown, allowedKind: 'product' | 'addon'): Selection[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 80).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const code = cleanText(row.code, 24);
    const quantity = Number(row.quantity);
    const fact = authoritativePrices.get(code);
    const isAddon = code.startsWith('AO-');
    if (!code || !fact || (allowedKind === 'addon') !== isAddon || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) return [];
    return [{ code, name: fact.name, quantity, unitPrice: fact.price }];
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] || character));
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD', maximumFractionDigits: 0,
  }).format(value);
}

async function sendEmail(params: { to: string; subject: string; text: string; html: string }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.BETTER_HOME_SELECTION_FROM_EMAIL
    || process.env.BHT_ADVISORY_FROM_EMAIL
    || 'Better Home <noreply@bhtechnology.com.au>';
  if (!apiKey) {
    console.warn('[better-home-selection] RESEND_API_KEY not set; email confirmation was not sent');
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to: [params.to], subject: params.subject, text: params.text, html: params.html }),
    });
    if (!response.ok) {
      console.error('[better-home-selection] Resend rejected email', await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error('[better-home-selection] email delivery failed', error instanceof Error ? error.message : error);
    return false;
  }
}

function selectionRows(items: Selection[]): string {
  return items.map((item) => `${item.quantity} × ${item.name}`).join('\n');
}

function emailShell(params: { eyebrow: string; title: string; body: string; total: string; detailHtml: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#f5f1ea;color:#252823;font-family:Arial,sans-serif">
  <main style="max-width:640px;margin:0 auto;padding:40px 22px">
    <p style="margin:0 0 28px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#65755d">${params.eyebrow}</p>
    <section style="background:#fffdf9;border:1px solid #ddd7cc;border-radius:24px;padding:36px">
      <h1 style="margin:0;font-family:Georgia,serif;font-size:37px;font-weight:400;line-height:1.05">${params.title}</h1>
      <p style="margin:24px 0;color:#5f665d;font-size:16px;line-height:1.65">${params.body}</p>
      <div style="margin:30px 0;padding:20px;border-radius:16px;background:#30372f;color:#fff">${params.detailHtml}
        <p style="margin:18px 0 0;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#c6d0bd">Indicative investment</p>
        <p style="margin:5px 0 0;font-family:Georgia,serif;font-size:32px">${params.total}</p>
      </div>
      <p style="margin:0;color:#6b716a;font-size:13px;line-height:1.6">This is a guide based on the standard scope selected online. A final proposal follows site review and confirmed selections.</p>
    </section>
    <p style="margin:26px 4px;color:#697068;font-size:13px;line-height:1.7">Better Home Technology · Adelaide<br><a href="tel:0410323034" style="color:#4f5f49">0410 323 034</a> · <a href="mailto:info@bhtechnology.com.au" style="color:#4f5f49">info@bhtechnology.com.au</a></p>
  </main></body></html>`;
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body: Record<string, unknown>;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) }; }

  const name = cleanText(body.name, 120);
  const phone = cleanText(body.phone, 40);
  const email = cleanText(body.email, 180);
  const suburb = cleanText(body.suburb, 160);
  const notes = cleanText(body.notes, 2000);
  const waterRiskLocations = Array.isArray(body.waterRiskLocations)
    ? body.waterRiskLocations.map((item) => cleanText(item, 100)).filter(Boolean).slice(0, 20)
    : [];
  const selections = validSelections(body.selections, 'product');
  const addons = validSelections(body.addons, 'addon');
  const experienceTargets = Array.isArray(body.experienceTargets)
    ? body.experienceTargets.slice(0, 40).map((target) => ({
        experienceCode: cleanText((target as Record<string, unknown>)?.experienceCode, 24),
        room: cleanText((target as Record<string, unknown>)?.room, 60),
      })).filter((target) => target.experienceCode && target.room)
    : [];
  const selectedProductCodes = new Set(selections.map((item) => item.code));
  const invalidAddon = addons.find((addon) => !(addonParents.get(addon.code) || []).some((parent) => selectedProductCodes.has(parent)));
  if (invalidAddon) {
    return { statusCode: 400, body: JSON.stringify({ error: `${invalidAddon.name} requires its parent product.` }) };
  }
  for (const experienceCode of Object.keys(compatibleRoomCodes)) {
    const selectedExperience = selections.find((item) => item.code === experienceCode);
    if (!selectedExperience) continue;
    const availableRooms = compatibleRoomCodes[experienceCode].reduce(
      (sum, roomCode) => sum + (selections.find((item) => item.code === roomCode)?.quantity || 0),
      0
    );
    const targets = experienceTargets.filter((target) => target.experienceCode === experienceCode);
    const validTargetPrefixes = compatibleRoomCodes[experienceCode].map((code) => `${code}:`);
    if (
      targets.length !== selectedExperience.quantity ||
      targets.length > availableRooms ||
      new Set(targets.map((target) => target.room)).size !== targets.length ||
      targets.some((target) => !validTargetPrefixes.some((prefix) => target.room.startsWith(prefix)))
    ) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Please assign each room-based Experience to a selected compatible room.' }) };
    }
  }
  const estimatedTotal = [...selections, ...addons].reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  if (!name || phone.replace(/\D/g, '').length < 8 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !suburb) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Please complete your contact details.' }) };
  }
  if (!selections.length) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Please choose at least one product.' }) };
  }
  if (waterRiskLocations.length && !selectedProductCodes.has('C-06')) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Extended water leak locations require Away Collection.' }) };
  }
  if (waterRiskLocations.length > 1) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Away Collection includes one selected external water-risk location. We can scope further locations in your final proposal.' }) };
  }

  let crmBase = cleanText(process.env.CRM_API_BASE_URL, 500);
  if (!crmBase) return { statusCode: 503, body: JSON.stringify({ error: 'Better Home is temporarily unavailable. Please call 0410 323 034.' }) };
  if (!/^https?:\/\//i.test(crmBase)) crmBase = `https://${crmBase}`;

  const lines = [
    'Better Home online selection',
    ...selections.map((item) => `${item.quantity} × ${item.name} (${item.code})`),
    ...addons.map((item) => `${item.quantity} × ${item.name} (${item.code})`),
    ...experienceTargets.map((target) => `${target.experienceCode} applied to ${target.room}`),
    ...waterRiskLocations.map((location) => `Away water-risk location requested: ${location}`),
    `Indicative total: $${estimatedTotal.toLocaleString('en-AU')}`,
    notes ? `Customer notes: ${notes}` : null,
  ].filter(Boolean);

  try {
    const response = await fetch(`${crmBase.replace(/\/$/, '')}/api/public/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, phone, email, suburb,
        source: 'direct',
        product_interest: 'Better Home',
        product_type: 'better_home',
        service_type: 'better_home_selection',
        message: lines.join(' | '),
        landing_page_url: cleanText(body.page_url, 1000),
        raw_payload: {
          channel: 'public_better_home_shop',
          product_os_release: 'V2.07',
          selections,
          addons,
          experience_targets: experienceTargets,
          water_risk_locations: waterRiskLocations,
          estimated_total_incl_gst: estimatedTotal,
          customer_notes: notes || null,
        },
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'CRM rejected request');

    const reference = typeof result.lead_id === 'string' ? result.lead_id : null;
    const selectedLines = [...selections, ...addons];
    const summaryText = selectionRows(selectedLines);
    const summaryHtml = selectedLines.map((item) => (
      `<p style="margin:0 0 9px;font-size:15px;line-height:1.45">${item.quantity} × ${escapeHtml(item.name)}</p>`
    )).join('');
    const total = formatCurrency(estimatedTotal);
    const customerHtml = emailShell({
      eyebrow: 'Better Home · Selection received',
      title: 'Your home is beginning to take shape.',
      body: `Thank you, ${escapeHtml(name)}. We have received your Better Home selection and will review it with the conditions of your home in mind.`,
      total,
      detailHtml: `<p style="margin:0 0 16px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#c6d0bd">Your starting point</p>${summaryHtml}`,
    });
    const customerText = `Thank you, ${name}. We have received your Better Home selection.\n\nYour starting point:\n${summaryText}\n\nIndicative investment: ${total}\n\nWe will review the selection, confirm site conditions and then prepare a clear formal proposal.\n\nBetter Home Technology\n0410 323 034 · info@bhtechnology.com.au`;
    const internalHtml = emailShell({
      eyebrow: 'New Better Home online selection',
      title: `${escapeHtml(name)} has started a Better Home plan.`,
      body: `${escapeHtml(suburb)} · ${escapeHtml(phone)} · ${escapeHtml(email)}${reference ? ` · CRM reference ${escapeHtml(reference)}` : ''}`,
      total,
      detailHtml: `<p style="margin:0 0 16px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#c6d0bd">Selected online</p>${summaryHtml}${notes ? `<p style="margin:18px 0 0;padding-top:16px;border-top:1px solid rgba(255,255,255,.18);font-size:14px;line-height:1.55;color:#e1e6dc"><strong>Notes:</strong> ${escapeHtml(notes)}</p>` : ''}`,
    });
    const internalText = `New Better Home online selection\n\n${name}\n${phone}\n${email}\n${suburb}${reference ? `\nCRM reference: ${reference}` : ''}\n\nSelected online:\n${summaryText}\n\nIndicative investment: ${total}${notes ? `\n\nNotes: ${notes}` : ''}`;
    const internalRecipient = cleanText(process.env.BETTER_HOME_SELECTION_TO_EMAIL, 180) || 'info@bhtechnology.com.au';
    const [customerEmailSent, internalEmailSent] = await Promise.all([
      sendEmail({ to: email, subject: 'We have received your Better Home selection', text: customerText, html: customerHtml }),
      sendEmail({ to: internalRecipient, subject: `New Better Home selection · ${name} · ${total}`, text: internalText, html: internalHtml }),
    ]);

    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        reference,
        customerEmailSent,
        internalEmailSent,
      }),
    };
  } catch (error) {
    console.error('[better-home-selection] CRM submission failed', error instanceof Error ? error.message : error);
    return { statusCode: 502, body: JSON.stringify({ error: 'We could not send this selection. Please call 0410 323 034.' }) };
  }
};
