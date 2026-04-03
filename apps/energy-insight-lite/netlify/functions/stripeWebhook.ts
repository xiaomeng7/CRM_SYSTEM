/**
 * POST /.netlify/functions/stripeWebhook
 * Stripe webhook: checkout.session.completed (and async_payment_succeeded) → update lead to paid.
 */

import type { Handler, HandlerEvent } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";
import Stripe from "stripe";

const LITE_AMOUNT_CENTS = 19900;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "" };
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const dbUrl = process.env.NEON_DATABASE_URL;
  if (!stripeSecret || !dbUrl?.startsWith("postgres") || !WEBHOOK_SECRET) {
    console.error("Missing STRIPE_SECRET_KEY, NEON_DATABASE_URL, or STRIPE_WEBHOOK_SECRET");
    return { statusCode: 503, body: "" };
  }

  const sig = event.headers["stripe-signature"];
  const rawBody = event.body;
  if (!sig || !rawBody) {
    return { statusCode: 400, body: "" };
  }

  let stripeEvent: Stripe.Event;
  try {
    const stripe = new Stripe(stripeSecret);
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return { statusCode: 400, body: "" };
  }

  const type = stripeEvent.type;
  const allowed = ["checkout.session.completed", "checkout.session.async_payment_succeeded"];
  if (!allowed.includes(type)) {
    return { statusCode: 200, body: "" };
  }

  const session = stripeEvent.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") {
    return { statusCode: 200, body: "" };
  }

  const sessionId = session.id;
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

  const sql = neon(dbUrl);
  await sql`
    UPDATE advisory_applications
    SET
      payment_status = 'paid',
      amount_paid = ${LITE_AMOUNT_CENTS},
      currency = 'aud',
      paid_at = NOW(),
      stripe_payment_intent_id = ${paymentIntentId}
    WHERE stripe_checkout_session_id = ${sessionId}
  `;

  // Update CRM lead status to 'qualified' and log payment conversion
  const crmUrl = process.env.CRM_API_URL || "https://crmsystem-production-70c2.up.railway.app";
  const customerEmail = session.customer_details?.email || session.customer_email || null;
  const customerName  = session.customer_details?.name  || null;
  const customerPhone = session.customer_details?.phone || null;
  try {
    // Push a fresh paid lead (will deduplicate on contact if same phone/email)
    await fetch(`${crmUrl}/api/public/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: customerName || customerEmail || "Energy Customer",
        phone: customerPhone || null,
        email: customerEmail || null,
        source: "landing:energy_lite",
        product_type: "energy_lite",
        service_type: "Energy Monitoring",
        notes: `Energy report purchased — $199. Stripe session: ${sessionId}`,
        status: "qualified",
      }),
    });
  } catch (crmErr) {
    console.warn("[energy webhook] CRM update failed:", crmErr);
  }

  return { statusCode: 200, body: "" };
};
