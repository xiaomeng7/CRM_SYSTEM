import type { Handler, HandlerEvent } from '@netlify/functions';
import importPlan from '../../../../packages/product-os/generated/import-plan-v2.07.json';

type Selection = { code: string; name: string; quantity: number; unitPrice: number };

const authoritativePrices = new Map([
  ...importPlan.prices
    .filter((price) => price.customerVisible)
    .map((price) => [price.productCode, { name: importPlan.products.find((product) => product.productCode === price.productCode)?.canonicalName || price.productCode, price: price.customerPriceInclGst }]),
  ...importPlan.addons
    .filter((addon) => addon.eligibilityStatus === 'ELIGIBLE')
    .map((addon) => [addon.productCode, { name: addon.canonicalName, price: addon.customerPriceInclGst }]),
]);

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
  const selections = validSelections(body.selections, 'product');
  const addons = validSelections(body.addons, 'addon');
  const experienceTargets = Array.isArray(body.experienceTargets)
    ? body.experienceTargets.slice(0, 40).map((target) => ({
        experienceCode: cleanText((target as Record<string, unknown>)?.experienceCode, 24),
        room: cleanText((target as Record<string, unknown>)?.room, 60),
      })).filter((target) => target.experienceCode && target.room)
    : [];
  const estimatedTotal = [...selections, ...addons].reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  if (!name || phone.replace(/\D/g, '').length < 8 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !suburb) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Please complete your contact details.' }) };
  }
  if (!selections.length) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Please choose at least one product.' }) };
  }

  let crmBase = cleanText(process.env.CRM_API_BASE_URL, 500);
  if (!crmBase) return { statusCode: 503, body: JSON.stringify({ error: 'Better Home is temporarily unavailable. Please call 0410 323 034.' }) };
  if (!/^https?:\/\//i.test(crmBase)) crmBase = `https://${crmBase}`;

  const lines = [
    'Better Home online selection',
    ...selections.map((item) => `${item.quantity} × ${item.name} (${item.code})`),
    ...addons.map((item) => `${item.quantity} × ${item.name} (${item.code})`),
    ...experienceTargets.map((target) => `${target.experienceCode} applied to ${target.room}`),
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
          estimated_total_incl_gst: estimatedTotal,
          customer_notes: notes || null,
        },
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'CRM rejected request');
    return { statusCode: 201, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, reference: result.lead_id || null }) };
  } catch (error) {
    console.error('[better-home-selection] CRM submission failed', error instanceof Error ? error.message : error);
    return { statusCode: 502, body: JSON.stringify({ error: 'We could not send this selection. Please call 0410 323 034.' }) };
  }
};
