/**
 * POST /api/apply-pre-purchase
 * BHT Pre-Purchase Electrical Inspection — booking request
 * Pushes lead to CRM with product_type=pre_purchase + notifies BHT team
 */

import type { Handler, HandlerEvent } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

const RATE_LIMIT_PER_IP = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const ipCache = new Map<string, { count: number; resetAt: number }>();

function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip + (process.env.RATE_LIMIT_SALT || "bht")).digest("hex").slice(0, 32);
}
function rateLimit(ip: string): boolean {
  const now = Date.now();
  const key = hashIp(ip);
  let e = ipCache.get(key);
  if (!e || now > e.resetAt) { ipCache.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS }); return true; }
  return ++e.count <= RATE_LIMIT_PER_IP;
}

type Body = {
  name: string; phone: string; email: string;
  property_address: string; inspection_date: string;
  settlement_date?: string | null; access_contact?: string | null;
  property_type?: string | null; notes?: string | null;
  utm_source?: string | null; utm_medium?: string | null;
  utm_campaign?: string | null; utm_content?: string | null;
  page_url?: string | null;
  gclid?: string | null; click_id?: string | null;
  landing_page_version?: string | null; creative_version?: string | null;
};

function optStr(b: Record<string, unknown>, key: string): string | null {
  const v = b[key];
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

function validate(body: unknown): { ok: true; data: Body } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid body" };
  const b = body as Record<string, unknown>;
  const name = String(b.name ?? "").trim();
  const phone = String(b.phone ?? "").trim();
  const email = String(b.email ?? "").trim();
  const property_address = String(b.property_address ?? "").trim();
  const inspection_date = String(b.inspection_date ?? "").trim();
  if (!name || name.length < 2) return { ok: false, error: "Name is required" };
  if (!phone || phone.replace(/\D/g, "").length < 8) return { ok: false, error: "Valid mobile is required" };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Valid email is required" };
  if (!property_address || property_address.length < 5) return { ok: false, error: "Property address is required" };
  if (!inspection_date) return { ok: false, error: "Inspection date is required" };
  return { ok: true, data: {
    name, phone, email, property_address, inspection_date,
    settlement_date: typeof b.settlement_date === "string" ? b.settlement_date || null : null,
    access_contact: typeof b.access_contact === "string" ? b.access_contact.trim() || null : null,
    property_type: typeof b.property_type === "string" ? b.property_type || null : null,
    notes: typeof b.notes === "string" ? b.notes.trim() || null : null,
    utm_source: optStr(b, "utm_source"),
    utm_medium: optStr(b, "utm_medium"),
    utm_campaign: optStr(b, "utm_campaign"),
    utm_content: optStr(b, "utm_content"),
    page_url: optStr(b, "page_url"),
    gclid: optStr(b, "gclid"),
    click_id: optStr(b, "click_id"),
    landing_page_version: optStr(b, "landing_page_version"),
    creative_version: optStr(b, "creative_version"),
  }};
}

async function sendEmail(params: { to: string; subject: string; text: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.BHT_ADVISORY_FROM_EMAIL || "BHT Inspections <noreply@bhtechnology.com.au>";
  if (!apiKey) { console.log("RESEND_API_KEY not set, skipping email"); return; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      text: params.text,
      html: params.text.replace(/\n/g, "<br>"),
    }),
  });
  if (!res.ok) console.error("Resend error:", await res.text());
}

function sanitizeInspectorSub(v: unknown): string | null {
  const s = String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!s || s.length > 128 || !/^[a-z][a-z0-9_]*$/.test(s)) return null;
  return s;
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };

  const ip = String(event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"] || "0.0.0.0");
  if (!rateLimit(ip)) return { statusCode: 429, body: JSON.stringify({ error: "Too many requests" }) };

  let body: unknown;
  try { body = event.body ? JSON.parse(event.body) : {}; }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const v = validate(body);
  if (!v.ok) return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: v.error }) };
  const data = v.data;

  // 1. Save to DB (reuse advisory_applications table)
  let appId: string | null = null;
  const dbUrl = process.env.NEON_DATABASE_URL;
  if (dbUrl?.startsWith("postgres")) {
    try {
      const sql = neon(dbUrl);
      const rows = await sql`
        INSERT INTO advisory_applications
          (name, mobile, email, suburb, property_type, solar_battery_status, bill_range, contact_time,
           notes, utm_source, utm_medium, utm_campaign, page_url, ip_hash, user_agent, source)
        VALUES (
          ${data.name}, ${data.phone}, ${data.email}, ${data.property_address},
          ${data.property_type || 'House'}, ${'N/A'}, ${'N/A'}, ${'Morning'},
          ${[
            data.access_contact ? `Agent: ${data.access_contact}` : null,
            data.settlement_date ? `Settlement: ${data.settlement_date}` : null,
            `Inspection date: ${data.inspection_date}`,
            data.notes ? `Notes: ${data.notes}` : null,
            data.landing_page_version ? `lpv: ${data.landing_page_version}` : null,
            data.creative_version ? `cv: ${data.creative_version}` : null,
            data.utm_content ? `utm_content: ${data.utm_content}` : null,
            data.gclid ? `gclid: ${data.gclid}` : null,
            data.click_id ? `click_id: ${data.click_id}` : null,
          ].filter(Boolean).join(' | ')},
          ${data.utm_source}, ${data.utm_medium}, ${data.utm_campaign},
          ${data.page_url}, ${hashIp(ip)}, ${event.headers["user-agent"] || ""}, ${'pre_purchase'}
        ) RETURNING id`;
      appId = (rows[0] as { id: string } | undefined)?.id ?? null;
    } catch (e) { console.error("DB error:", e); }
  }

  // 2. Push to CRM
  let crmBase = (process.env.CRM_API_BASE_URL || "").trim();
  if (crmBase) {
    if (!/^https?:\/\//i.test(crmBase)) crmBase = "https://" + crmBase;
    try {
      const raw = body as Record<string, unknown>;
      const urlSrc = String(raw.source ?? "").trim().toLowerCase();
      const inspectorSub =
        urlSrc === "inspector" ? sanitizeInspectorSub(raw.sub ?? raw.sub_source) : null;
      const crmSource = inspectorSub != null ? "inspector" : "landing:pre_purchase";
      const messageLines = [
        `Property: ${data.property_address}`,
        `Inspection date: ${data.inspection_date}`,
        data.settlement_date ? `Settlement: ${data.settlement_date}` : null,
        data.access_contact ? `Agent: ${data.access_contact}` : null,
        data.property_type ? `Type: ${data.property_type}` : null,
        data.notes ? `Notes: ${data.notes}` : null,
        inspectorSub ? `Inspector ref: ${inspectorSub}` : null,
        data.landing_page_version ? `LP version (lpv): ${data.landing_page_version}` : null,
        data.creative_version ? `Creative version (cv): ${data.creative_version}` : null,
      ].filter(Boolean);
      await fetch(`${crmBase.replace(/\/$/, "")}/api/public/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name, phone: data.phone, email: data.email,
          suburb: data.property_address,
          source: crmSource,
          ...(inspectorSub != null ? { sub_source: inspectorSub } : {}),
          product_type: "pre_purchase",
          service_type: "pre_purchase",
          message: messageLines.join(" | "),
          utm_source: data.utm_source,
          utm_medium: data.utm_medium,
          utm_campaign: data.utm_campaign,
          utm_content: data.utm_content,
          landing_page_url: data.page_url,
          landing_page_version: data.landing_page_version,
          creative_version: data.creative_version,
          gclid: data.gclid,
          click_id: data.click_id,
          raw_payload: {
            application_id: appId,
            property_address: data.property_address,
            inspection_date: data.inspection_date,
            settlement_date: data.settlement_date,
            access_contact: data.access_contact,
            property_type: data.property_type,
            utm_source: data.utm_source,
            utm_medium: data.utm_medium,
            utm_campaign: data.utm_campaign,
            utm_content: data.utm_content,
            page_url: data.page_url,
            gclid: data.gclid,
            click_id: data.click_id,
            landing_page_version: data.landing_page_version,
            creative_version: data.creative_version,
            client_source: typeof raw.source === "string" ? raw.source : null,
            ...(inspectorSub != null ? { sub_source: inspectorSub } : {}),
          },
        }),
      });
    } catch (e) { console.error("CRM push error:", e); }
  }

  // 3. Email BHT team
  const toEmail = process.env.BHT_ADVISORY_EMAIL_TO;
  if (toEmail) {
    try {
      await sendEmail({
        to: toEmail,
        subject: `[BHT Pre-Purchase] New booking — ${data.property_address}`,
        text: [
          "New pre-purchase inspection booking:",
          "",
          `Name: ${data.name}`,
          `Mobile: ${data.phone}`,
          `Email: ${data.email}`,
          `Property: ${data.property_address}`,
          `Inspection date: ${data.inspection_date}`,
          data.settlement_date ? `Settlement: ${data.settlement_date}` : null,
          data.access_contact ? `Agent: ${data.access_contact}` : null,
          data.property_type ? `Property type: ${data.property_type}` : null,
          data.notes ? `Notes: ${data.notes}` : null,
          "",
          `UTM: source=${data.utm_source || "-"} medium=${data.utm_medium || "-"} campaign=${data.utm_campaign || "-"} content=${data.utm_content || "-"}`,
          data.landing_page_version ? `lpv: ${data.landing_page_version}` : null,
          data.creative_version ? `cv: ${data.creative_version}` : null,
          data.gclid ? `gclid: ${data.gclid}` : null,
          data.click_id ? `click_id: ${data.click_id}` : null,
          appId ? `App ID: ${appId}` : null,
        ].filter(Boolean).join("\n"),
      });
    } catch (e) { console.error("Email error:", e); }
  }

  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true }) };
};
