/**
 * GET  /api/admin/advisory-applications — list applications
 * DELETE /api/admin/advisory-applications — delete one (body: { id: "uuid" })
 * Requires header: X-Admin-Key: <ADMIN_SECRET_KEY>
 */

import type { Handler, HandlerEvent } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";

function unauthorized() {
  return { statusCode: 401, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Unauthorized" }) };
}

function checkAuth(event: HandlerEvent): boolean {
  const adminKey = process.env.ADMIN_SECRET_KEY;
  const providedKey = event.headers["x-admin-key"] || event.queryStringParameters?.key;
  return !!(adminKey && providedKey && providedKey === adminKey);
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== "GET" && event.httpMethod !== "DELETE") {
    return { statusCode: 405, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  if (!checkAuth(event)) return unauthorized();

  const dbUrl = process.env.NEON_DATABASE_URL;
  if (!dbUrl || !dbUrl.startsWith("postgres")) {
    return { statusCode: 503, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Service unavailable" }) };
  }

  const sql = neon(dbUrl);

  if (event.httpMethod === "DELETE") {
    let id: string | null = null;
    try {
      const body = event.body ? JSON.parse(event.body) : {};
      id = typeof body.id === "string" ? body.id.trim() : null;
    } catch {
      return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Invalid body" }) };
    }
    if (!id) return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Missing id" }) };
    try {
      const rows = await sql`DELETE FROM advisory_applications WHERE id = ${id} RETURNING id`;
      if (rows.length === 0) {
        return { statusCode: 404, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Not found" }) };
      }
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true }) };
    } catch (err) {
      console.error("admin-advisory delete error:", err);
      return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Failed to delete" }) };
    }
  }

  try {
    const rows = await sql`
      SELECT id, created_at, name, mobile, email, suburb, property_type, solar_battery_status,
             bill_range, contact_time, notes, status, utm_source, utm_medium, utm_campaign, page_url,
             source, lite_snapshot, payment_status, amount_paid, currency, paid_at,
             stripe_checkout_session_id, stripe_payment_intent_id, credit_amount
      FROM advisory_applications
      ORDER BY created_at DESC
    `;
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applications: rows }) };
  } catch (err) {
    console.error("admin-advisory error:", err);
    return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Failed to fetch applications" }) };
  }
};
