/**
 * Repair Quote Engine (v1): map enriched findings → repair line items.
 * Read-only; no DB; does not mutate input findings.
 */

export type RepairItem = {
  title: string;
  category: string;
  priority: string;
  estimated_cost_low?: number;
  estimated_cost_high?: number;
  recommended_action: string;
};

const RECOMMENDED_ACTION = "Repair or upgrade by licensed electrician";

type CategoryKey = "Switchboard" | "Safety" | "Wiring" | "General Electrical";

const FALLBACK_RANGE: Record<CategoryKey, readonly [number, number]> = {
  Switchboard: [1200, 3000],
  Safety: [300, 800],
  Wiring: [500, 2000],
  "General Electrical": [200, 1000],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function extractValue(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (!("value" in value)) return value;
  const nested = (value as { value: unknown }).value;
  if (isRecord(nested) && "value" in nested) return extractValue(nested);
  return nested;
}

function asText(value: unknown): string {
  const v = extractValue(value);
  if (v == null) return "";
  const s = String(v).trim();
  return s;
}

function asFiniteNumber(value: unknown): number | null {
  const v = extractValue(value);
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = v.trim().replace(/,/g, "");
    const n = Number(t);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function inferCategory(titleLower: string): CategoryKey {
  if (titleLower.includes("switchboard")) return "Switchboard";
  if (titleLower.includes("rcd")) return "Safety";
  if (titleLower.includes("wiring")) return "Wiring";
  return "General Electrical";
}

function titleFromFinding(finding: Record<string, unknown>): string {
  const t = asText(finding.title);
  if (t) return t;
  const id = typeof finding.id === "string" ? finding.id.trim() : "";
  return id ? id.replace(/_/g, " ") : "Finding";
}

function priorityFromFinding(finding: Record<string, unknown>): string {
  const raw = finding.priority_final ?? finding.priority;
  const s = asText(raw);
  return s || "PLAN_MONITOR";
}

function resolveCosts(
  finding: Record<string, unknown>,
  category: CategoryKey
): Pick<RepairItem, "estimated_cost_low" | "estimated_cost_high"> {
  const low = asFiniteNumber(finding.budget_low);
  const high = asFiniteNumber(finding.budget_high);
  if (low != null && high != null) {
    const a = Math.min(low, high);
    const b = Math.max(low, high);
    return { estimated_cost_low: a, estimated_cost_high: b };
  }
  const [fbLow, fbHigh] = FALLBACK_RANGE[category];
  return { estimated_cost_low: fbLow, estimated_cost_high: fbHigh };
}

/**
 * Converts pipeline findings to repair items. Every input row yields one item (100% fallback).
 */
export function buildRepairItems(findings: unknown): RepairItem[] {
  if (!Array.isArray(findings)) return [];

  const out: RepairItem[] = [];
  for (const row of findings) {
    const finding = isRecord(row) ? row : {};
    const title = titleFromFinding(finding);
    const category = inferCategory(title.toLowerCase());
    const priority = priorityFromFinding(finding);
    const costs = resolveCosts(finding, category);

    out.push({
      title,
      category,
      priority,
      ...costs,
      recommended_action: RECOMMENDED_ACTION,
    });
  }
  return out;
}
