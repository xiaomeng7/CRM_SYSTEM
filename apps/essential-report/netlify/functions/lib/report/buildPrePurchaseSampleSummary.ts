/**
 * Pre-purchase report: lightweight summary DTO for sample-style HTML output.
 * Read-only adapter over existing raw + enriched findings; no schema or DB writes.
 */

import { buildRepairItems, type RepairItem } from "./buildRepairItems";

export type PrePurchaseDecision = "OPTION A" | "OPTION B" | "OPTION C";

export type PrePurchaseFindingCard = {
  title: string;
  priority_label: string;
  description?: string | null;
  estimated_cost?: string | null;
  recommended_action?: string | null;
  location?: string | null;
};

export type PrePurchaseSampleSummary = {
  title: string;
  subtitle: string;
  decision: PrePurchaseDecision;
  decision_tagline: string;
  /** Plain-language bullets explaining the A/B/C outcome (for buyers). */
  decision_explanation: string[];
  technical_risk_profile?: string | null;
  summary_paragraph: string;
  property_details: {
    address?: string | null;
    prepared_for?: string | null;
    assessment_date?: string | null;
    prepared_by?: string | null;
    property_type?: string | null;
    inspection_id?: string | null;
  };
  key_findings: PrePurchaseFindingCard[];
  /** Quote-layer line items from findings; separate from key_findings action cards. */
  repair_items: RepairItem[];
  budget_range?: string | null;
  /** One line on what the budget figure is based on (always set). */
  budget_basis_text: string;
  /** Short next-step bullets for the purchaser (always non-empty). */
  buyer_guidance: string[];
  urgent_action_required?: boolean;
  limitations_text?: string | null;
  declaration?: string | null;
};

export type PrePurchaseReportContext = {
  inspection_id: string;
  prepared_for?: string | null;
  prepared_by?: string | null;
  assessment_date?: string | null;
  limitations?: string[] | null;
  /** From full report pipeline (display only) */
  risk_rating?: string | null;
  capex_range?: string | null;
  /** When provided (e.g. from scoring in caller), refines budget disclaimer; omitted = treat as complete. */
  capex_incomplete?: boolean | null;
  executive_summary?: string | null;
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

function asText(value: unknown): string | null {
  const v = extractValue(value);
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function effectivePriority(finding: Record<string, unknown>): string {
  const pf = finding.priority_final ?? finding.priority;
  return typeof pf === "string" ? pf.trim().toUpperCase() : "";
}

function deriveDecision(findings: Array<Record<string, unknown>>): PrePurchaseDecision {
  for (const f of findings) {
    const p = effectivePriority(f);
    if (p === "IMMEDIATE" || p === "URGENT") return "OPTION C";
  }
  for (const f of findings) {
    const p = effectivePriority(f);
    if (p === "RECOMMENDED_0_3_MONTHS" || p === "RECOMMENDED") return "OPTION B";
  }
  return "OPTION A";
}

function decisionTagline(decision: PrePurchaseDecision): string {
  switch (decision) {
    case "OPTION A":
      return "Proceed – no major electrical risks identified.";
    case "OPTION B":
      return "Proceed with budget allowance for corrective works.";
    case "OPTION C":
    default:
      return "High-priority electrical risks should be resolved before proceeding.";
  }
}

/** Conservative display line from pipeline risk or decision fallback. */
function technicalRiskProfile(
  decision: PrePurchaseDecision,
  riskRatingFromPipeline: string | null
): string {
  const r = (riskRatingFromPipeline || "").trim().toUpperCase();
  if (r === "HIGH" || r === "MODERATE" || r === "LOW") return r;
  if (decision === "OPTION C") return "HIGH";
  if (decision === "OPTION B") return "MODERATE";
  return "LOW";
}

function priorityLabel(priority: string): string {
  const p = priority.trim().toUpperCase();
  if (p === "IMMEDIATE" || p === "URGENT") return "PRIORITY ACTION";
  if (p === "RECOMMENDED_0_3_MONTHS" || p === "RECOMMENDED") return "PLAN WITHIN 0–3 MONTHS";
  if (p === "PLAN_MONITOR" || p === "PLAN") return "ADVISORY";
  return p ? p.replace(/_/g, " ") : "ADVISORY";
}

function formatBudgetRange(finding: Record<string, unknown>): string | null {
  const low = finding.budget_low;
  const high = finding.budget_high;
  if (typeof low === "number" && typeof high === "number") {
    return `$${low.toLocaleString("en-AU")} – $${high.toLocaleString("en-AU")}`;
  }
  return null;
}

function titleFromFinding(finding: Record<string, unknown>): string {
  const t = asText(finding.title);
  if (t) return t;
  const id = typeof finding.id === "string" ? finding.id : "";
  return id ? id.replace(/_/g, " ") : "Finding";
}

function decisionExplanationBullets(decision: PrePurchaseDecision): string[] {
  if (decision === "OPTION C") {
    return [
      "High-priority electrical issues identified",
      "Immediate safety risks present",
      "Further investigation required before purchase",
    ];
  }
  if (decision === "OPTION B") {
    return [
      "Moderate electrical issues identified",
      "No immediate safety risks detected",
      "Budget required for repairs",
    ];
  }
  return [
    "No significant electrical risks identified",
    "System appears compliant at time of inspection",
    "No immediate repair budget required",
  ];
}

function buyerGuidanceBullets(decision: PrePurchaseDecision): string[] {
  if (decision === "OPTION C") {
    return [
      "Do not proceed until issues are resolved",
      "Request full repair or major price reduction",
      "Seek further specialist inspection if needed",
    ];
  }
  if (decision === "OPTION B") {
    return [
      "Proceed with budget allowance",
      "Request price adjustment from seller",
      "Plan electrical upgrades after settlement",
    ];
  }
  return [
    "Proceed with purchase",
    "No immediate electrical work required",
    "Consider routine maintenance only",
  ];
}

/** True when pipeline supplied a non-placeholder budget string. */
function hasMeaningfulCapexRange(capexRange: string | null | undefined): boolean {
  if (capexRange == null) return false;
  const t = String(capexRange).trim();
  if (!t || t.toLowerCase().includes("undefined")) return false;
  if (/^to be confirmed/i.test(t.replace(/\s+/g, " ").trim())) return false;
  return true;
}

function buildBudgetBasisText(
  hasRange: boolean,
  capexIncomplete: boolean | null | undefined
): string {
  if (!hasRange) {
    return "No significant repair costs identified at time of inspection.";
  }
  if (capexIncomplete === true) {
    return "Estimated based on visible issues only. Additional costs may apply after further inspection.";
  }
  return "Estimated based on identified electrical issues and typical repair ranges.";
}

export function buildPrePurchaseSampleSummary(
  raw: Record<string, unknown>,
  findings: Array<Record<string, unknown>>,
  ctx: PrePurchaseReportContext
): PrePurchaseSampleSummary {
  const job = isRecord(raw.job) ? raw.job : {};
  const signoff = isRecord(raw.signoff) ? raw.signoff : {};

  const decision = deriveDecision(findings);
  const tagline = decisionTagline(decision);
  const technical = technicalRiskProfile(decision, ctx.risk_rating ?? null);
  const decision_explanation = decisionExplanationBullets(decision);
  const buyer_guidance = buyerGuidanceBullets(decision);

  const propertyAddress = asText(job.address) || ctx.prepared_for || null;
  const preparedBy = ctx.prepared_by || asText(signoff.technician_name) || null;
  const assessmentDate = ctx.assessment_date || asText(raw.created_at) || null;
  const preparedFor = ctx.prepared_for || propertyAddress;
  const propertyType = asText(job.property_type);

  const budgetRange =
    ctx.capex_range && String(ctx.capex_range).trim() && !String(ctx.capex_range).includes("undefined")
      ? String(ctx.capex_range).trim()
      : null;

  const hasMeaningfulRange = hasMeaningfulCapexRange(budgetRange);
  const budget_basis_text = buildBudgetBasisText(hasMeaningfulRange, ctx.capex_incomplete);

  let summaryParagraph =
    (ctx.executive_summary && String(ctx.executive_summary).trim()) ||
    "This pre-purchase electrical inspection summarises observed conditions to support your purchase decision. Review key findings and limitations below; obtain quotes for any remedial works before settlement where applicable.";

  if (decision === "OPTION C") {
    summaryParagraph = `${summaryParagraph}\n\nUrgent electrical items were noted. Engage a licensed electrician to scope and complete required works before relying on the installation or proceeding to settlement.`;
  } else if (decision === "OPTION B") {
    summaryParagraph = `${summaryParagraph}\n\nSeveral items warrant planned remediation or negotiation; budget for corrective works in line with the estimates provided where available.`;
  }

  const key_findings: PrePurchaseFindingCard[] = findings.map((f) => {
    const p = effectivePriority(f);
    return {
      title: titleFromFinding(f),
      priority_label: priorityLabel(p || "PLAN_MONITOR"),
      description: null,
      estimated_cost: formatBudgetRange(f),
      recommended_action: null,
      location: asText(f.location),
    };
  });

  const repair_items = buildRepairItems(findings);

  const limitations_text =
    ctx.limitations && ctx.limitations.length > 0
      ? ctx.limitations.join("\n")
      : "This inspection is limited to visible and accessible electrical components at the time of attendance. Concealed cabling, buried sections, and energised testing beyond the scope agreed were not assessed.";

  const declaration =
    "This report is an independent pre-purchase electrical assessment for property purchasers. It is not a certificate of compliance. Engage licensed contractors for quotations and remedial work.";

  return {
    title: "Pre-Purchase Electrical Inspection Report",
    subtitle: "Independent electrical assessment for property purchasers — South Australia",
    decision,
    decision_tagline: tagline,
    decision_explanation,
    technical_risk_profile: technical,
    summary_paragraph: summaryParagraph.trim(),
    property_details: {
      address: propertyAddress,
      prepared_for: preparedFor,
      assessment_date: assessmentDate,
      prepared_by: preparedBy,
      property_type: propertyType,
      inspection_id: ctx.inspection_id,
    },
    key_findings,
    repair_items,
    budget_range: budgetRange,
    budget_basis_text,
    buyer_guidance,
    urgent_action_required: decision === "OPTION C",
    limitations_text,
    declaration,
  };
}
