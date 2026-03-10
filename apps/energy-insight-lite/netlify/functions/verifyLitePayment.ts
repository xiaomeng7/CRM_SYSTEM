/**
 * GET verifyLitePayment?session_id=cs_xxx — verify paid, update lead, return { paid, creditAmount }.
 */
import type { Handler, HandlerEvent } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";
import Stripe from "stripe";

const LITE_AMOUNT_CENTS = 19900;

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const sessionId = event.queryStringParameters?.session_id?.trim();
  if (!sessionId) {
    return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paid: false, error: "Missing session_id" }) };
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const dbUrl = process.env.NEON_DATABASE_URL;
  if (!stripeSecret || !dbUrl?.startsWith("postgres")) {
    return { statusCode: 503, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paid: false }) };
  }

  const stripe = new Stripe(stripeSecret);
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["payment_intent"] });

  if (session.payment_status !== "paid") {
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paid: false }) };
  }

  const paymentIntentId =
    typeof session.payment_intent === "object" && session.payment_intent?.id
      ? session.payment_intent.id
      : typeof session.payment_intent === "string"
        ? session.payment_intent
        : null;

  const sql = neon(dbUrl);
  await sql`
    UPDATE advisory_applications
    SET payment_status = 'paid', amount_paid = ${LITE_AMOUNT_CENTS}, currency = 'aud',
        paid_at = NOW(), stripe_payment_intent_id = ${paymentIntentId}
    WHERE stripe_checkout_session_id = ${sessionId}
  `;

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paid: true, creditAmount: LITE_AMOUNT_CENTS }),
  };
};
