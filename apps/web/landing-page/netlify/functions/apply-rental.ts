/**
 * POST /api/apply-rental
 * BHT Rental Changeover Inspection — enquiry submission
 * Creates a lead in CRM with product_type=rental_lite, source=landing:rental_lite
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
  let entry = ipCache.get(key);
  if (!entry) {
    entry = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    ipCache.set(key, entry);
    return true;
  }
  if (now > entry.resetAt) {
    entry = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    ipCache.set(key, entry);
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_PER_IP;
}

type RentalBody = {
  agency_name: string;
  contact_name: string;
  phone: string;
  email: string;
  property_address: string;
  preferred_date: string | null;
  portfolio_size: string | null;
  notes: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  page_url?: string | null;
  gclid?: string | null;
  click_id?: string | null;
  landing_page_version?: string | null;
  creative_version?: string | null;
};

function validate(body: unknown): { ok: true; data: RentalBody } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid request body" };
  const b = body as Record<string, unknown>;

  const agency_name = String(b.agency_name ?? "").trim();
  const contact_name = String(b.contact_name ?? "").trim();
  const phone = String(b.phone ?? "").trim();
  const email = String(b.email ?? "").trim();
  const property_address = String(b.property_address ?? "").trim();

  if (!agency_name || agency_name.length < 2) return { ok: false, error: "Agency name is required" };
  if (!contact_name || contact_name.length < 2) return { ok: false, error: "Contact name is required" };
  if (!phone || phone.replace(/\D/g, "").length < 8) return { ok: false, error: "Valid phone number is required" };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Valid email address is required" };
  if (!property_address || property_address.length < 5) return { ok: false, error: "Property address is required" };

  return {
    ok: true,
    data: {
      agency_name,
      contact_name,
      phone,
      email,
      property_address,
      preferred_date: typeof b.preferred_date === "string" && b.preferred_date ? b.preferred_date : null,
      portfolio_size: typeof b.portfolio_size === "string" && b.portfolio_size ? b.portfolio_size : null,
      notes: typeof b.notes === "string" && b.notes ? b.notes.trim() : null,
      utm_source: typeof b.utm_source === "string" ? b.utm_source.trim() || null : null,
      utm_medium: typeof b.utm_medium === "string" ? b.utm_medium.trim() || null : null,
      utm_campaign: typeof b.utm_campaign === "string" ? b.utm_campaign.trim() || null : null,
      utm_content: typeof b.utm_content === "string" ? b.utm_content.trim() || null : null,
      page_url: typeof b.page_url === "string" ? b.page_url.trim() || null : null,
      gclid: typeof b.gclid === "string" ? b.gclid.trim() || null : null,
      click_id: typeof b.click_id === "string" ? b.click_id.trim() || null : null,
      landing_page_version: typeof b.landing_page_version === "string" ? b.landing_page_version.trim() || null : null,
      creative_version: typeof b.creative_version === "string" ? b.creative_version.trim() || null : null,
    },
  };
}

async function sendEmail(params: { to: string; subject: string; text: string }): Promise<void> {
  const apiKey = process.env.POSTMARK_API_KEY;
  const mailgunKey = process.env.MAILGUN_API_KEY;
  const mailgunDomain = process.env.MAILGUN_DOMAIN;
  const fromEmail = process.env.BHT_ADVISORY_FROM_EMAIL || "noreply@bhtechnology.com.au";
  const fromName = "BHT Rental Inspections";

  if (apiKey) {
    await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Postmark-Server-Token": apiKey },
      body: JSON.stringify({ From: `${fromName} <${fromEmail}>`, To: params.to, Subject: params.subject, TextBody: params.text, HtmlBody: params.text.replace(/\n/g, "<br>") }),
    });
    return;
  }
  if (mailgunKey && mailgunDomain) {
    const form = new FormData();
    form.append("from", `${fromName} <${fromEmail}>`);
    form.append("to", params.to);
    form.append("subject", params.subject);
    form.append("text", params.text);
    await fetch(`https://api.mailgun.net/v3/${mailgunDomain}/messages`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`api:${mailgunKey}`).toString("base64")}` },
      body: form,
    });
    return;
  }
  console.warn("No email provider configured — skipping notification.");
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
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const ip = event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"] || "0.0.0.0";
  const ipStr = Array.isArray(ip) ? ip[0] : String(ip);
  if (!rateLimit(ipStr)) {
    return { statusCode: 429, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Too many requests. Please try again later." }) };
  }

  let body: unknown;
  try { body = event.body ? JSON.parse(event.body) : {}; }
  catch { return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const validated = validate(body);
  if (!validated.ok) {
    return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: validated.error }) };
  }
  const data = validated.data;

  // 1. Persist to advisory_applications table (reuse existing table, mark with source)
  const dbUrl = process.env.NEON_DATABASE_URL;
  let appId: string | null = null;
  if (dbUrl && dbUrl.startsWith("postgres")) {
    try {
      const sql = neon(dbUrl);
      const rows = await sql`
        INSERT INTO advisory_applications
          (name, mobile, email, suburb, property_type, solar_battery_status, bill_range, contact_time,
           notes, utm_source, utm_medium, utm_campaign, page_url, ip_hash, user_agent, source)
        VALUES (
          ${data.contact_name},
          ${data.phone},
          ${data.email},
          ${data.property_address},
          ${'Rental'},
          ${'N/A'},
          ${'N/A'},
          ${'Morning'},
          ${[
            `Agency: ${data.agency_name}`,
            data.portfolio_size ? `Portfolio: ${data.portfolio_size}` : null,
            data.preferred_date ? `Preferred date: ${data.preferred_date}` : null,
            data.notes ? `Notes: ${data.notes}` : null,
          ].filter(Boolean).join(' | ')},
          ${data.utm_source ?? null},
          ${data.utm_medium ?? null},
          ${data.utm_campaign ?? null},
          ${data.page_url ?? null},
          ${hashIp(ipStr)},
          ${event.headers["user-agent"] || ""},
          ${'rental_lite'}
        )
        RETURNING id
      `;
      appId = (rows[0] as { id: string } | undefined)?.id ?? null;
    } catch (e) {
      console.error("DB insert error:", e);
      // Non-fatal — still push to CRM
    }
  }

  // 2. Push to CRM as a lead
  let crmBase = (process.env.CRM_API_BASE_URL || "").trim();
  if (!crmBase) {
    console.error("CRM_API_BASE_URL is missing; cannot confirm CRM lead write.");
    return {
      statusCode: 503,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "CRM lead intake unavailable: CRM_API_BASE_URL is not configured" }),
    };
  }
  if (!/^https?:\/\//i.test(crmBase)) crmBase = "https://" + crmBase;
  const crmUrl = `${crmBase.replace(/\/$/, "")}/api/public/leads`;
    const raw = body as Record<string, unknown>;
    const urlSrc = String(raw.source ?? "").trim().toLowerCase();
    const inspectorSub =
      urlSrc === "inspector" ? sanitizeInspectorSub(raw.sub ?? raw.sub_source) : null;
    const crmSource = inspectorSub != null ? "inspector" : "landing:rental_lite";
    const messageLines = [
      `Agency: ${data.agency_name}`,
      data.portfolio_size ? `Portfolio size: ${data.portfolio_size}` : null,
      data.preferred_date ? `Preferred date: ${data.preferred_date}` : null,
      data.notes ? `Notes: ${data.notes}` : null,
      inspectorSub ? `Inspector ref: ${inspectorSub}` : null,
    ].filter(Boolean);
    const crmPayload = {
      name: data.contact_name,
      phone: data.phone,
      email: data.email,
      suburb: data.property_address,
      source: crmSource,
      ...(inspectorSub != null ? { sub_source: inspectorSub } : {}),
      service_type: "rental_lite",
      product_type: "rental_lite",
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
        agency_name: data.agency_name,
        property_address: data.property_address,
        portfolio_size: data.portfolio_size,
        preferred_date: data.preferred_date,
        application_id: appId,
        utm_source: data.utm_source,
        utm_medium: data.utm_medium,
        utm_campaign: data.utm_campaign,
        utm_content: data.utm_content,
        page_url: data.page_url,
        gclid: data.gclid,
        click_id: data.click_id,
        landing_page_version: data.landing_page_version,
        creative_version: data.creative_version,
      },
    };
  let crmLeadId: string | null = null;
  try {
    const crmRes = await fetch(crmUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(crmPayload),
    });
    const crmText = await crmRes.text();
    let crmJson: Record<string, unknown> | null = null;
    try {
      crmJson = crmText ? (JSON.parse(crmText) as Record<string, unknown>) : null;
    } catch {
      crmJson = null;
    }
    if (!crmRes.ok) {
      console.error("CRM lead intake non-2xx response:", {
        status: crmRes.status,
        body: crmText,
        target_url: crmUrl,
      });
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "CRM lead intake failed",
          crm_url: crmUrl,
          status: crmRes.status,
        }),
      };
    }
    crmLeadId = crmJson && typeof crmJson.lead_id === "string" ? crmJson.lead_id : null;
    console.log("CRM lead intake success:", { lead_id: crmLeadId, target_url: crmUrl });
  } catch (e) {
    console.error("CRM lead push error:", { error: e, target_url: crmUrl });
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: "CRM lead intake request failed",
        crm_url: crmUrl,
      }),
    };
  }

  // 3. Notify BHT team by email
  const toEmail = process.env.BHT_ADVISORY_EMAIL_TO;
  if (toEmail) {
    const subject = `[BHT Rental] New inspection enquiry — ${data.agency_name} — ${data.property_address}`;
    const text = [
      `New rental changeover inspection enquiry:`,
      ``,
      `Agency: ${data.agency_name}`,
      `Contact: ${data.contact_name}`,
      `Phone: ${data.phone}`,
      `Email: ${data.email}`,
      `Property address: ${data.property_address}`,
      data.preferred_date ? `Preferred date: ${data.preferred_date}` : null,
      data.portfolio_size ? `Portfolio size: ${data.portfolio_size}` : null,
      data.notes ? `Notes: ${data.notes}` : null,
      ``,
      `UTM: source=${data.utm_source || "-"} medium=${data.utm_medium || "-"} campaign=${data.utm_campaign || "-"} content=${data.utm_content || "-"}`,
      data.landing_page_version ? `LP version (lpv): ${data.landing_page_version}` : null,
      data.creative_version ? `Creative version (cv): ${data.creative_version}` : null,
      appId ? `Application ID: ${appId}` : null,
    ].filter(Boolean).join("\n");
    try { await sendEmail({ to: toEmail, subject, text }); } catch (e) { console.error("Email error:", e); }
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, success: true, lead_id: crmLeadId, crm_url: crmUrl }),
  };
};
