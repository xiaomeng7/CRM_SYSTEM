/**
 * POST /api/apply-advisory
 * BHT Energy Decision Advisory – application submission
 */

import type { Handler, HandlerEvent } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

const RATE_LIMIT_PER_IP = 5;
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

type ApplicationBody = {
  name: string;
  mobile: string;
  email: string;
  suburb: string;
  property_type: "House" | "Townhouse" | "Other";
  solar_battery_status: "None" | "Considering" | "Already have solar" | "Already have battery";
  bill_range: "under $2k" | "$2–3k" | "$3–4k" | "$4k+";
  contact_time: "Morning" | "Afternoon" | "Evening";
  notes?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  page_url?: string;
  click_id?: string;
  gclid?: string;
  landing_variant_id?: string;
  landing_page_version?: string;
  creative_version?: string;
  source?: "pro_direct" | "lite_upgrade";
  lite_snapshot?: string | null;
};

const PROPERTY_TYPES = ["House", "Townhouse", "Other"];
const SOLAR_STATUS = ["None", "Considering", "Already have solar", "Already have battery"];
const BILL_RANGES = ["under $2k", "$2–3k", "$3–4k", "$4k+"];
const CONTACT_TIMES = ["Morning", "Afternoon", "Evening"];

function validate(body: unknown): { ok: true; data: ApplicationBody } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid JSON body" };
  const b = body as Record<string, unknown>;
  const name = String(b.name ?? "").trim();
  const mobile = String(b.mobile ?? "").trim();
  const email = String(b.email ?? "").trim();
  const suburb = String(b.suburb ?? "").trim();
  const propertyType = String(b.property_type ?? "").trim();
  const solarStatus = String(b.solar_battery_status ?? "").trim();
  const billRange = String(b.bill_range ?? "").trim();
  const contactTime = String(b.contact_time ?? "").trim();

  if (!name || name.length < 2) return { ok: false, error: "Full name is required" };
  if (!mobile || mobile.length < 8) return { ok: false, error: "Valid mobile is required" };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Valid email is required" };
  if (!suburb || suburb.length < 2) return { ok: false, error: "Suburb is required" };
  if (!PROPERTY_TYPES.includes(propertyType)) return { ok: false, error: "Invalid property type" };
  if (!SOLAR_STATUS.includes(solarStatus)) return { ok: false, error: "Invalid solar/battery status" };
  if (!BILL_RANGES.includes(billRange)) return { ok: false, error: "Invalid bill range" };
  if (!CONTACT_TIMES.includes(contactTime)) return { ok: false, error: "Invalid contact time" };

  const sourceVal = typeof b.source === "string" && b.source === "lite_upgrade" ? "lite_upgrade" : "pro_direct";
  const liteSnapshot = typeof b.lite_snapshot === "string" ? b.lite_snapshot.trim() || null : (b.lite_snapshot === null || b.lite_snapshot === undefined ? null : undefined);

  return {
    ok: true,
    data: {
      name,
      mobile,
      email,
      suburb,
      property_type: propertyType as ApplicationBody["property_type"],
      solar_battery_status: solarStatus as ApplicationBody["solar_battery_status"],
      bill_range: billRange as ApplicationBody["bill_range"],
      contact_time: contactTime as ApplicationBody["contact_time"],
      notes: typeof b.notes === "string" ? b.notes.trim() : undefined,
      utm_source: typeof b.utm_source === "string" ? b.utm_source.trim() : undefined,
      utm_medium: typeof b.utm_medium === "string" ? b.utm_medium.trim() : undefined,
      utm_campaign: typeof b.utm_campaign === "string" ? b.utm_campaign.trim() : undefined,
      utm_content: typeof b.utm_content === "string" ? b.utm_content.trim() : undefined,
      page_url: typeof b.page_url === "string" ? b.page_url.trim() : undefined,
      click_id: typeof b.click_id === "string" ? b.click_id.trim() : undefined,
      gclid: typeof b.gclid === "string" ? b.gclid.trim() : undefined,
      landing_variant_id: typeof b.landing_variant_id === "string" ? b.landing_variant_id.trim() : undefined,
      landing_page_version: typeof b.landing_page_version === "string" ? b.landing_page_version.trim() : undefined,
      creative_version: typeof b.creative_version === "string" ? b.creative_version.trim() : undefined,
      source: sourceVal,
      lite_snapshot: liteSnapshot === undefined ? null : liteSnapshot,
    },
  };
}

async function sendEmail(params: { to: string; subject: string; text: string; html?: string }): Promise<void> {
  const apiKey = process.env.POSTMARK_API_KEY;
  const mailgunKey = process.env.MAILGUN_API_KEY;
  const mailgunDomain = process.env.MAILGUN_DOMAIN;
  const fromEmail = process.env.BHT_ADVISORY_FROM_EMAIL || "noreply@betterhometech.com.au";
  const fromName = process.env.BHT_ADVISORY_FROM_NAME || "BHT Advisory";

  if (apiKey) {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Postmark-Server-Token": apiKey },
      body: JSON.stringify({ From: `${fromName} <${fromEmail}>`, To: params.to, Subject: params.subject, TextBody: params.text, HtmlBody: params.html || params.text.replace(/\n/g, "<br>") }),
    });
    if (!res.ok) throw new Error(`Postmark error: ${res.status} ${await res.text()}`);
    return;
  }
  if (mailgunKey && mailgunDomain) {
    const form = new FormData();
    form.append("from", `${fromName} <${fromEmail}>`);
    form.append("to", params.to);
    form.append("subject", params.subject);
    form.append("text", params.text);
    if (params.html) form.append("html", params.html);
    const res = await fetch(`https://api.mailgun.net/v3/${mailgunDomain}/messages`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`api:${mailgunKey}`).toString("base64")}` },
      body: form,
    });
    if (!res.ok) throw new Error(`Mailgun error: ${res.status} ${await res.text()}`);
    return;
  }
  console.warn("No email provider configured. Skipping notification.");
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Method not allowed" }) };

  const ip = event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"] || "0.0.0.0";
  const ipStr = Array.isArray(ip) ? ip[0] : String(ip);
  if (!rateLimit(ipStr)) return { statusCode: 429, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Too many submissions. Please try again later." }) };

  let body: unknown;
  try { body = event.body ? JSON.parse(event.body) : {}; } catch { return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const validated = validate(body);
  if (!validated.ok) return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: validated.error }) };
  const data = validated.data;

  const dbUrl = process.env.NEON_DATABASE_URL;
  if (!dbUrl || !dbUrl.startsWith("postgres")) return { statusCode: 503, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Service temporarily unavailable" }) };

  const userAgent = event.headers["user-agent"] || "";
  const ipHash = hashIp(ipStr);

  try {
    const sql = neon(dbUrl);
    const rows = await sql`
      INSERT INTO advisory_applications (name, mobile, email, suburb, property_type, solar_battery_status, bill_range, contact_time, notes, utm_source, utm_medium, utm_campaign, page_url, ip_hash, user_agent, source, lite_snapshot)
      VALUES (${data.name}, ${data.mobile}, ${data.email}, ${data.suburb}, ${data.property_type}, ${data.solar_battery_status}, ${data.bill_range}, ${data.contact_time}, ${data.notes ?? null}, ${data.utm_source ?? null}, ${data.utm_medium ?? null}, ${data.utm_campaign ?? null}, ${data.page_url ?? null}, ${ipHash}, ${userAgent}, ${data.source ?? "pro_direct"}, ${data.lite_snapshot ?? null})
      RETURNING id, created_at
    `;
    const row = rows[0] as { id: string; created_at: string } | undefined;
    if (!row) throw new Error("Insert failed");

    // Fan-out: also create a lead inside CRM (apps/crm) for the new application.
    let crmBase = (process.env.CRM_API_BASE_URL || "").trim();
    if (crmBase) {
      if (!/^https?:\/\//i.test(crmBase)) crmBase = "https://" + crmBase;
      const crmUrl = `${crmBase.replace(/\/$/, "")}/api/public/leads`;
      const messageLines = [
        `Property type: ${data.property_type}`,
        `Solar/battery status: ${data.solar_battery_status}`,
        `Bill range: ${data.bill_range}`,
        `Contact time: ${data.contact_time}`,
        data.notes ? `Notes: ${data.notes}` : null,
        `Source: ${data.source || "pro_direct"}`,
      ].filter(Boolean);
      const crmPayload = {
        name: data.name,
        phone: data.mobile,
        email: data.email,
        suburb: data.suburb,
        source: data.source === "lite_upgrade" ? "landing:advisory:lite_upgrade" : "landing:advisory",
        service_type: "energy_advisory",
        message: messageLines.join(" | "),
        utm_source: data.utm_source || null,
        utm_medium: data.utm_medium || null,
        utm_campaign: data.utm_campaign || null,
        utm_content: data.utm_content || null,
        landing_page_url: data.page_url || null,
        landing_page_version: data.landing_page_version || null,
        creative_version: data.creative_version || null,
        raw_payload: {
          application_id: row.id,
          utm_source: data.utm_source,
          utm_medium: data.utm_medium,
          utm_campaign: data.utm_campaign,
          utm_content: data.utm_content,
          page_url: data.page_url,
          click_id: data.click_id || null,
          gclid: data.gclid || null,
          landing_variant_id: data.landing_variant_id || null,
          landing_page_version: data.landing_page_version || null,
          creative_version: data.creative_version || null,
        },
        click_id: data.click_id || null,
        gclid: data.gclid || null,
        landing_variant_id: data.landing_variant_id || null,
      };
      try {
        await fetch(crmUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(crmPayload),
        });
      } catch (e) {
        console.error("CRM lead intake error:", e);
      }
    }

    const toEmail = process.env.BHT_ADVISORY_EMAIL_TO;
    const subject = `[BHT] New Advisory Application - ${data.suburb} - ${data.name}`;
    const text = [
      `New application received:`,
      ``,
      `Name: ${data.name}`,
      `Mobile: ${data.mobile}`,
      `Email: ${data.email}`,
      `Suburb: ${data.suburb}`,
      `Property type: ${data.property_type}`,
      `Solar/battery status: ${data.solar_battery_status}`,
      `Bill range: ${data.bill_range}`,
      `Contact time: ${data.contact_time}`,
      data.notes ? `Notes: ${data.notes}` : null,
      ``,
      `UTM: source=${data.utm_source || "-"} medium=${data.utm_medium || "-"} campaign=${data.utm_campaign || "-"} content=${data.utm_content || "-"}`,
      data.landing_page_version ? `LP version (lpv): ${data.landing_page_version}` : null,
      data.creative_version ? `Creative version (cv): ${data.creative_version}` : null,
      `Page URL: ${data.page_url || "-"}`,
      ``,
      `Application ID: ${row.id}`,
      `Created: ${row.created_at}`,
    ]
      .filter(Boolean)
      .join("\n");

    if (toEmail) await sendEmail({ to: toEmail, subject, text });

    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true, id: row.id }) };
  } catch (err) {
    console.error("apply-advisory error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    const hint = /column.*(source|lite_snapshot)/i.test(msg)
      ? " Run: psql \"$NEON_DATABASE_URL\" -f migrations/003_advisory_source_lite.sql"
      : "";
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Failed to submit application. Please try again." + hint }),
    };
  }
};
