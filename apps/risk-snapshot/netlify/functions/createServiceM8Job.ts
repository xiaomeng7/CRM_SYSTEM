/**
 * Netlify Function: Create ServiceM8 Job from Snapshot submission.
 *
 * Flow: validate request → upsertClient (Company) → upsertCompanyContact → create Job
 *       → create Note (ServiceM8 Note resource) → optional Job Contact.
 *
 * Input: GET ?lead_id=...&timestamp=...&sig=... or POST body with same.
 * Env: SERVICEM8_API_KEY, SERVICEM8_BASE_URL (optional), SNAPSHOT_SIGNING_SECRET,
 *      SERVICEM8_JOB_STATUS, SERVICEM8_JOB_DESCRIPTION.
 */

import { createDecipheriv, createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";

interface NetlifyEvent {
  httpMethod?: string;
  queryStringParameters?: Record<string, string>;
  headers?: Record<string, string>;
  body?: string | null;
}

/** ServiceM8 error payload (from API response). */
interface ServiceM8Error {
  errorCode?: number;
  message?: string;
  documentation?: string;
}

const SERVICEM8_API_KEY = process.env.SERVICEM8_API_KEY;
const SERVICEM8_BASE_URL = process.env.SERVICEM8_BASE_URL || "https://api.servicem8.com/api_1.0";
const SNAPSHOT_SIGNING_SECRET = process.env.SNAPSHOT_SIGNING_SECRET;
const JOB_STATUS = process.env.SERVICEM8_JOB_STATUS || "Quote";
const JOB_DESCRIPTION = process.env.SERVICEM8_JOB_DESCRIPTION || "Whole house electric health check";
const INSPECTION_BASE_URL = process.env.INSPECTION_BASE_URL || "";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";
const LEAD_TOKEN_VERSION = "v1";
const LINK_MAX_AGE_SECONDS = Math.max(60, Number(process.env.SERVICEM8_LINK_MAX_AGE_SECONDS || 7 * 24 * 60 * 60));
const MAX_FUTURE_SKEW_SECONDS = 5 * 60;
// ServiceM8 contact type values usually: "Job Contact" / "Billing Contact" / "Property Manager"
const COMPANY_CONTACT_TYPE = process.env.SERVICEM8_COMPANY_CONTACT_TYPE || "Job Contact";
const JOB_CONTACT_TYPE = process.env.SERVICEM8_JOB_CONTACT_TYPE || "Job Contact";

const DOC_LINK = "https://developer.servicem8.com/llms.txt";

interface SnapshotPayload {
  name: string;
  email: string;
  phone: string;
  address?: string;
  summary?: string;
  notes?: string;
  risk_band?: string;
  triggers?: string;
  review_url?: string;
  submitted_at?: string | number;
  snapshot_intake?: {
    profile?: string;
    profileDeclared?: string;
    primaryGoal?: string;
    tenantChangeSoon?: boolean;
    managerMode?: string;
    portfolioSizeBand?: string;
    billBand?: string;
    billUploadWilling?: boolean;
    allElectricNoGas?: boolean;
    devices?: string[];
    symptoms?: string[];
    hasSolar?: boolean;
    hasBattery?: boolean;
    hasEv?: boolean;
  };
}

interface CreateJobResult {
  job_uuid: string;
  job_number?: string;
}

function getRequestId(): string {
  return randomUUID().slice(0, 8);
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, "base64url").toString("utf8");
}

function sign(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function verifySignature(leadId: string, timestamp: string, sig: string): boolean {
  if (!SNAPSHOT_SIGNING_SECRET) return false;
  const expected = sign(SNAPSHOT_SIGNING_SECRET, leadId + timestamp);
  if (!expected || !sig || expected.length !== sig.length) return false;
  return timingSafeEqual(Buffer.from(sig, "utf8"), Buffer.from(expected, "utf8"));
}

function deriveAesKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

function decryptLeadToken(leadId: string): string | null {
  if (!SNAPSHOT_SIGNING_SECRET) return null;
  const parts = leadId.split(".");
  if (parts.length !== 4 || parts[0] !== LEAD_TOKEN_VERSION) return null;
  try {
    const iv = Buffer.from(parts[1], "base64url");
    const encrypted = Buffer.from(parts[2], "base64url");
    const tag = Buffer.from(parts[3], "base64url");
    const key = deriveAesKey(SNAPSHOT_SIGNING_SECRET);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    return plaintext;
  } catch {
    return null;
  }
}

function parseLeadId(leadId: string): SnapshotPayload | null {
  try {
    // v1: encrypted token; legacy fallback: base64url JSON
    const raw = decryptLeadToken(leadId) || base64UrlDecode(leadId);
    const data = JSON.parse(raw) as SnapshotPayload;
    if (!data.email || !data.name) return null;
    return data;
  } catch {
    return null;
  }
}

function parseTimestampMs(timestamp: string): number | null {
  const s = (timestamp || "").trim();
  if (!/^\d{10,16}$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return s.length <= 10 ? n * 1000 : n;
}

function validateLinkAge(timestamp: string): { ok: true } | { ok: false; reason: string } {
  const tsMs = parseTimestampMs(timestamp);
  if (!tsMs) return { ok: false, reason: "Invalid timestamp" };
  const now = Date.now();
  if (tsMs - now > MAX_FUTURE_SKEW_SECONDS * 1000) return { ok: false, reason: "Timestamp is in the future" };
  if (now - tsMs > LINK_MAX_AGE_SECONDS * 1000) return { ok: false, reason: "Link expired" };
  return { ok: true };
}

/** Normalize for matching: trim, lower, collapse spaces. */
function normalize(s: string): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] || "Unknown", last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/** Parse ServiceM8 error response. Never log full body (may contain secrets). */
function parseServiceM8Error(status: number, text: string): { message: string; documentation?: string } {
  let message = `ServiceM8 error ${status}`;
  let documentation: string | undefined;
  try {
    const data = JSON.parse(text) as ServiceM8Error;
    if (data.message) message = data.message;
    if (data.documentation) documentation = data.documentation;
  } catch {
    if (text.length < 200) message = text;
  }
  return { message, documentation };
}

function extractJobNumber(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const obj = data as Record<string, unknown>;
  const value = obj.generated_job_id ?? obj.job_number ?? obj.generated_job_number;
  if (value === undefined || value === null) return undefined;
  return String(value);
}

async function servicem8Fetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = path.startsWith("http") ? path : `${SERVICEM8_BASE_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-API-Key": SERVICEM8_API_KEY!,
    ...(options.headers as Record<string, string>),
  };
  return fetch(url, { ...options, headers });
}

/** List companies (first page). ServiceM8 may paginate. */
async function listCompanies(): Promise<Array<{ uuid?: string; name?: string; address?: string; address_1?: string; address_street?: string }>> {
  try {
    const res = await servicem8Fetch("company.json");
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Match by normalized name + normalized address. */
function matchCompanyByNameAddress(
  list: Array<{ uuid?: string; name?: string; address?: string; address_1?: string; address_street?: string }>,
  name: string,
  address: string
): string | null {
  const nName = normalize(name);
  const nAddr = normalize(address);
  for (const c of list) {
    const cName = normalize((c.name as string) || "");
    const cAddr = normalize((c.address as string) || (c.address_street as string) || (c.address_1 as string) || "");
    if (cName && cName === nName && (nAddr === "" || cAddr === nAddr) && c.uuid) return c.uuid;
  }
  return null;
}

/** Find company by email via CompanyContact (Client itself has no direct email field). */
async function findCompanyByEmail(email: string): Promise<string | null> {
  try {
    const safe = email.replace(/'/g, "''");
    const res = await servicem8Fetch(`companycontact.json?$filter=email eq '${safe}'`);
    if (!res.ok) return null;
    const list = (await res.json()) as Array<{ company_uuid?: string; email?: string }>;
    if (Array.isArray(list) && list.length > 0 && list[0].company_uuid) return list[0].company_uuid;
  } catch {
    // ignore
  }
  try {
    const list = (await servicem8Fetch("companycontact.json").then((r) => (r.ok ? r.json() : []))) as Array<{
      company_uuid?: string;
      email?: string;
    }>;
    const nEmail = normalize(email);
    for (const c of list) {
      if (normalize((c.email as string) || "") === nEmail && c.company_uuid) return c.company_uuid;
    }
  } catch {
    // ignore
  }
  return null;
}

/** Generate unique client name to avoid "Name must be unique". */
function uniqueClientName(payload: SnapshotPayload, suffix?: string): string {
  const name = (payload.name || "").trim();
  const addr = (payload.address || "").trim();
  const shortAddr = addr ? addr.slice(0, 25).trim() : "";
  const base = shortAddr ? `${name} - ${shortAddr}` : name;
  if (suffix) return `${base} - ${suffix}`;
  return base.slice(0, 250);
}

/**
 * Upsert client (Company). Find by email, else by normalized name+address.
 * If not found, create with unique name ("First Last - short address" or with suffix on collision).
 */
async function upsertClient(
  payload: SnapshotPayload,
  log: (msg: string, extra?: Record<string, unknown>) => void
): Promise<{ company_uuid: string; reused: boolean }> {
  if ((payload.email || "").trim()) {
    const byEmail = await findCompanyByEmail(payload.email.trim());
    if (byEmail) {
      log("client reused (email)", { company_uuid: byEmail });
      return { company_uuid: byEmail, reused: true };
    }
  }

  const list = await listCompanies();
  const addr = (payload.address || "").trim();
  const byNameAddr = matchCompanyByNameAddress(list, payload.name, addr);
  if (byNameAddr) {
    log("client reused (name+address)", { company_uuid: byNameAddr });
    return { company_uuid: byNameAddr, reused: true };
  }

  const createBody = (name: string): Record<string, string> => {
    const body: Record<string, string> = {
      name,
    };
    if (addr) {
      body.address = addr;
      body.address_street = addr;
    }
    return body;
  };

  let nameToUse = uniqueClientName(payload);
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await servicem8Fetch("company.json", {
      method: "POST",
      body: JSON.stringify(createBody(nameToUse)),
    });
    if (res.ok) {
      const uuid = res.headers.get("x-record-uuid") || (await res.json() as { uuid?: string }).uuid;
      if (uuid) {
        log("client created", { company_uuid: uuid });
        return { company_uuid: uuid, reused: false };
      }
    }
    const text = await res.text();
    const err = parseServiceM8Error(res.status, text);
    if (err.message.includes("Name must be unique") || err.message.includes("unique")) {
      const existing = await findCompanyByName(nameToUse);
      if (existing) {
        log("client reused (after name conflict)", { company_uuid: existing });
        return { company_uuid: existing, reused: true };
      }
      nameToUse = uniqueClientName(payload, randomUUID().slice(0, 4));
      continue;
    }
    throw new Error(err.documentation ? `${err.message} (${err.documentation})` : err.message);
  }
  throw new Error("Could not create client: Name must be unique (tried with suffix)");
}

async function findCompanyByName(name: string): Promise<string | null> {
  if (!name || name.length > 250) return null;
  try {
    const safe = name.replace(/'/g, "''");
    const res = await servicem8Fetch(`company.json?$filter=name eq '${safe}'`);
    if (!res.ok) return null;
    const list = (await res.json()) as Array<{ uuid?: string }>;
    if (Array.isArray(list) && list.length > 0 && list[0].uuid) return list[0].uuid;
  } catch {
    // ignore
  }
  return null;
}

/** List company contacts for a company. */
async function listCompanyContacts(companyUuid: string): Promise<Array<{ uuid?: string; email?: string }>> {
  try {
    const safe = companyUuid.replace(/'/g, "''");
    const res = await servicem8Fetch(`companycontact.json?$filter=company_uuid eq '${safe}'`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Upsert company contact: match by email; update if found, else create.
 */
async function upsertCompanyContact(
  companyUuid: string,
  payload: SnapshotPayload,
  log: (msg: string, extra?: Record<string, unknown>) => void
): Promise<string | null> {
  const contacts = await listCompanyContacts(companyUuid);
  const nEmail = normalize((payload.email || "").trim());
  const existing = contacts.find((c) => normalize((c.email as string) || "") === nEmail);

  const { first, last } = splitName((payload.name || "").trim());
  const body = {
    company_uuid: companyUuid,
    first,
    last,
    email: (payload.email || "").trim(),
    phone: (payload.phone || "").trim(),
    mobile: (payload.phone || "").trim(),
    type: COMPANY_CONTACT_TYPE,
    is_primary_contact: "1",
  };

  if (existing?.uuid) {
    try {
      await servicem8Fetch(`companycontact/${existing.uuid}.json`, {
        method: "POST",
        body: JSON.stringify({ uuid: existing.uuid, ...body }),
      });
      log("company_contact updated", { company_contact_uuid: existing.uuid });
      return existing.uuid;
    } catch {
      // non-fatal
    }
    return existing.uuid;
  }

  try {
    const res = await servicem8Fetch("companycontact.json", { method: "POST", body: JSON.stringify(body) });
    if (!res.ok) return null;
    const uuid = res.headers.get("x-record-uuid") || (await res.json() as { uuid?: string }).uuid;
    if (uuid) log("company_contact created", { company_contact_uuid: uuid });
    return uuid || null;
  } catch {
    return null;
  }
}

/** Create job (company_uuid, job_address, job_description, status only). */
async function createJob(
  companyUuid: string,
  payload: SnapshotPayload,
  log: (msg: string, extra?: Record<string, unknown>) => void
): Promise<CreateJobResult> {
  const jobAddress = (payload.address || "").trim() || "Address not provided";
  const body = {
    company_uuid: companyUuid,
    job_address: jobAddress,
    job_description: JOB_DESCRIPTION,
    status: JOB_STATUS,
  };
  const res = await servicem8Fetch("job.json", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text();
    const err = parseServiceM8Error(res.status, text);
    throw new Error(err.documentation ? `${err.message} (${err.documentation})` : err.message);
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    // Some endpoints may return empty body and only x-record-uuid header.
  }
  const uuid = res.headers.get("x-record-uuid") || (data.uuid as string | undefined);
  if (uuid) {
    const jobNumber = extractJobNumber(data);
    log("job created", { job_uuid: uuid, job_number: jobNumber || "" });
    return { job_uuid: uuid, job_number: jobNumber };
  }
  throw new Error("ServiceM8 job creation did not return uuid");
}

async function fetchJobNumberByUuid(
  jobUuid: string,
  log: (msg: string, extra?: Record<string, unknown>) => void
): Promise<string | undefined> {
  try {
    const res = await servicem8Fetch(`job/${jobUuid}.json`);
    if (!res.ok) {
      log("job lookup failed", { job_uuid: jobUuid, status: res.status });
      return undefined;
    }
    const data = (await res.json()) as Record<string, unknown>;
    const jobNumber = extractJobNumber(data);
    if (jobNumber) log("job number fetched", { job_uuid: jobUuid, job_number: jobNumber });
    return jobNumber;
  } catch (e) {
    log("job lookup error", { job_uuid: jobUuid, error: String(e) });
    return undefined;
  }
}

async function pushServiceJobLinkToInspection(
  input: { job_uuid: string; job_number: string },
  log: (msg: string, extra?: Record<string, unknown>) => void
): Promise<{ ok: boolean; warning?: string }> {
  if (!INSPECTION_BASE_URL || !INTERNAL_API_KEY) {
    const warning = "Inspection push skipped: INSPECTION_BASE_URL or INTERNAL_API_KEY not set";
    log("inspection push skipped", { reason: warning });
    return { ok: false, warning };
  }
  try {
    const url = INSPECTION_BASE_URL.replace(/\/$/, "") + "/api/internal/service-job-link";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-api-key": INTERNAL_API_KEY,
      },
      body: JSON.stringify({
        job_uuid: input.job_uuid,
        job_number: input.job_number,
        source: "snapshot",
      }),
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      const warning = `Inspection push failed: ${res.status}`;
      log("inspection push failed", { status: res.status, body_preview: bodyText.slice(0, 200) });
      return { ok: false, warning };
    }
    log("inspection push success", { job_uuid: input.job_uuid, job_number: input.job_number });
    return { ok: true };
  } catch (e) {
    const warning = "Inspection push error";
    log("inspection push error", { error: String(e) });
    return { ok: false, warning };
  }
}

/** Build internal note body from snapshot (for Note resource). */
function buildNoteBody(payload: SnapshotPayload): string {
  const submittedAt =
    payload.submitted_at != null
      ? typeof payload.submitted_at === "number"
        ? new Date(payload.submitted_at).toISOString()
        : String(payload.submitted_at)
      : new Date().toISOString();
  const intake = payload.snapshot_intake || {};
  const intakeParts: string[] = [];
  if (intake.profile) intakeParts.push(`profile=${intake.profile}`);
  if (intake.profileDeclared) intakeParts.push(`profileDeclared=${intake.profileDeclared}`);
  if (intake.primaryGoal) intakeParts.push(`primaryGoal=${intake.primaryGoal}`);
  if (intake.tenantChangeSoon !== undefined) intakeParts.push(`tenantChangeSoon=${String(intake.tenantChangeSoon)}`);
  if (intake.managerMode) intakeParts.push(`managerMode=${intake.managerMode}`);
  if (intake.portfolioSizeBand) intakeParts.push(`portfolioSizeBand=${intake.portfolioSizeBand}`);
  if (intake.billBand) intakeParts.push(`billBand=${intake.billBand}`);
  if (intake.billUploadWilling !== undefined) intakeParts.push(`billUploadWilling=${String(intake.billUploadWilling)}`);
  if (intake.allElectricNoGas !== undefined) intakeParts.push(`allElectricNoGas=${String(intake.allElectricNoGas)}`);
  if (Array.isArray(intake.devices) && intake.devices.length) intakeParts.push(`devices=${intake.devices.join(",")}`);
  if (Array.isArray(intake.symptoms) && intake.symptoms.length) intakeParts.push(`symptoms=${intake.symptoms.join(",")}`);
  if (intake.hasSolar !== undefined) intakeParts.push(`hasSolar=${String(intake.hasSolar)}`);
  if (intake.hasBattery !== undefined) intakeParts.push(`hasBattery=${String(intake.hasBattery)}`);
  if (intake.hasEv !== undefined) intakeParts.push(`hasEv=${String(intake.hasEv)}`);

  const parts: string[] = [
    "Source: Snapshot",
    `Submission: ${submittedAt}`,
    payload.risk_band ? `Risk/Result: ${payload.risk_band}` : "",
    payload.summary ? `Summary:\n${payload.summary}` : "",
    intakeParts.length ? `Snapshot intake:\n${intakeParts.join("\n")}` : "",
    payload.triggers ? `Triggers/Notes: ${payload.triggers}` : "",
    payload.notes ? `Notes: ${payload.notes}` : "",
    payload.review_url ? `Review: ${payload.review_url}` : "",
  ].filter(Boolean);
  return parts.join("\n");
}

/**
 * Create a ServiceM8 Note and associate to the job. Non-fatal on failure.
 * Tries job_uuid + note body (field name may be note/body/text per API).
 */
async function createNoteForJob(
  jobUuid: string,
  noteBody: string,
  log: (msg: string, extra?: Record<string, unknown>) => void
): Promise<string | null> {
  if (!noteBody.trim()) return null;
  for (const relatedObject of ["job", "Job"]) {
    try {
      const res = await servicem8Fetch("note.json", {
        method: "POST",
        body: JSON.stringify({
          related_object: relatedObject,
          related_object_uuid: jobUuid,
          note: noteBody,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { uuid?: string };
        const uuid = res.headers.get("x-record-uuid") || data?.uuid;
        if (uuid) log("note created", { note_uuid: uuid });
        return uuid || null;
      }
    } catch (e) {
      log("note create error (non-fatal)", { error: String(e) });
    }
  }
  log("note create failed (non-fatal)");
  return null;
}

/** Optional: create job contact linked to job (and company contact if available). */
async function createJobContactOptional(
  jobUuid: string,
  payload: SnapshotPayload,
  companyContactUuid: string | null,
  log: (msg: string, extra?: Record<string, unknown>) => void
): Promise<void> {
  try {
    const { first, last } = splitName((payload.name || "").trim());
    const body: Record<string, string> = { job_uuid: jobUuid };
    if (companyContactUuid) {
      body.company_contact_uuid = companyContactUuid;
    } else {
      body.first = first;
      body.last = last;
      body.email = (payload.email || "").trim();
      body.phone = (payload.phone || "").trim();
      body.mobile = (payload.phone || "").trim();
    }
    body.type = JOB_CONTACT_TYPE;
    const res = await servicem8Fetch("jobcontact.json", { method: "POST", body: JSON.stringify(body) });
    if (res.ok) {
      const uuid = res.headers.get("x-record-uuid");
      if (uuid) log("job_contact created", { job_contact_uuid: uuid });
    } else {
      log("job_contact create failed (non-fatal)", { status: res.status });
    }
  } catch (e) {
    log("job_contact error (non-fatal)", { error: String(e) });
  }
}

function htmlPage(title: string, body: string, isError: boolean): string {
  const status = isError ? "Error" : "Success";
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><title>${escapeHtml(title)}</title></head>
<body>
  <h1>${escapeHtml(status)}</h1>
  ${body}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const handler = async (event: NetlifyEvent): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> => {
  const requestId = getRequestId();
  const method = event.httpMethod || "GET";
  const accept = event.headers?.["accept"] || "";
  const wantsHtml = accept.includes("text/html");

  const log = (msg: string, extra?: Record<string, unknown>) => {
    console.log(JSON.stringify({ requestId, msg, ...extra }));
  };

  if (!SERVICEM8_API_KEY) {
    log("missing SERVICEM8_API_KEY");
    return { statusCode: 503, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: false, error: "Service not configured" }) };
  }
  if (!SNAPSHOT_SIGNING_SECRET) {
    log("missing SNAPSHOT_SIGNING_SECRET");
    return { statusCode: 503, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: false, error: "Service not configured" }) };
  }

  let leadId: string;
  let timestamp: string;
  let sig: string;

  if (method === "GET") {
    const params = event.queryStringParameters || {};
    leadId = params.lead_id || "";
    timestamp = params.timestamp || "";
    sig = params.sig || "";
  } else if (method === "POST") {
    try {
      const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body || {};
      leadId = body.lead_id || "";
      timestamp = body.timestamp || String(body.timestamp || "");
      sig = body.sig || "";
      if (!leadId && body.payload && body.sig) {
        const raw = typeof body.payload === "string" ? body.payload : JSON.stringify(body.payload);
        const base64UrlEncode = (s: string) => Buffer.from(s, "utf8").toString("base64url");
        leadId = base64UrlEncode(raw);
        timestamp = body.timestamp || String(Date.now());
        sig = body.sig;
      }
    } catch {
      return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: false, error: "Invalid request body" }) };
    }
  } else {
    return { statusCode: 405, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: false, error: "Method not allowed" }) };
  }

  if (!leadId || !timestamp || !sig) {
    log("missing lead_id, timestamp or sig");
    return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: false, error: "Missing lead_id, timestamp or sig" }) };
  }
  if (!verifySignature(leadId, timestamp, sig)) {
    log("invalid signature");
    return { statusCode: 403, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: false, error: "Invalid signature" }) };
  }
  const ageCheck = validateLinkAge(timestamp);
  if (!ageCheck.ok) {
    log("expired or invalid timestamp", { reason: ageCheck.reason });
    const statusCode = ageCheck.reason === "Link expired" ? 410 : 400;
    return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: false, error: ageCheck.reason }) };
  }

  const payload = parseLeadId(leadId);
  if (!payload) {
    log("invalid lead_id payload");
    return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: false, error: "Invalid lead_id" }) };
  }

  log("processing", { lead_id_prefix: leadId.slice(0, 20) + "..." });

  let companyUuid: string;
  let jobUuid: string;
  let jobNumber: string | undefined;
  let companyReused = false;
  const warnings: string[] = [];

  try {
    const clientResult = await upsertClient(payload, log);
    companyUuid = clientResult.company_uuid;
    companyReused = clientResult.reused;

    const companyContactUuid = await upsertCompanyContact(companyUuid, payload, log);

    const created = await createJob(companyUuid, payload, log);
    jobUuid = created.job_uuid;
    jobNumber = created.job_number;

    if (!jobNumber) {
      jobNumber = await fetchJobNumberByUuid(jobUuid, log);
      if (!jobNumber) warnings.push("job_number not found after create");
    }

    const noteBody = buildNoteBody(payload);
    await createNoteForJob(jobUuid, noteBody, log);

    await createJobContactOptional(jobUuid, payload, companyContactUuid, log);

    if (jobNumber) {
      const pushed = await pushServiceJobLinkToInspection({ job_uuid: jobUuid, job_number: jobNumber }, log);
      if (!pushed.ok && pushed.warning) warnings.push(pushed.warning);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("error", { error: message });
    const isClientErr = /invalid|required|unique|not found|bad request|mandatory/i.test(message);
    const statusCode = isClientErr ? 400 : 500;
    const docHint = message.includes("developer.servicem8") ? "" : ` See ${DOC_LINK}`;
    const body = JSON.stringify({ ok: false, error: message + docHint });
    if (wantsHtml) {
      return { statusCode, headers: { "Content-Type": "text/html; charset=utf-8" }, body: htmlPage("Create ServiceM8 Job", `<p>Error: ${escapeHtml(message)}</p><p><a href="${DOC_LINK}">ServiceM8 docs</a></p>`, true) };
    }
    return { statusCode, headers: { "Content-Type": "application/json" }, body };
  }

  const jsonBody = JSON.stringify({
    ok: true,
    company_uuid: companyUuid,
    job_uuid: jobUuid,
    job_number: jobNumber || null,
    company_reused: companyReused,
    warnings,
  });

  if (wantsHtml) {
    const html = htmlPage(
      "Create ServiceM8 Job",
      `<p>Job created successfully.</p><ul><li>Company: ${escapeHtml(companyUuid)} ${companyReused ? "(reused)" : "(new)"}</li><li>Job: ${escapeHtml(jobUuid)}</li></ul><p><a href="${escapeHtml(SERVICEM8_BASE_URL.replace("/api_1.0", ""))}">Open ServiceM8</a></p>`,
      false
    );
    return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8" }, body: html };
  }
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: jsonBody };
};
