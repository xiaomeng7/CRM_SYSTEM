import type { PrePurchaseDecision, PrePurchaseFindingCard, PrePurchaseSampleSummary } from "./buildPrePurchaseSampleSummary";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function verdictStyles(decision: PrePurchaseDecision): { wrap: string; badge: string } {
  if (decision === "OPTION A") {
    return {
      wrap: "background:#f0faf4;border:3px solid #22c55e;border-radius:10px;padding:1.5rem 1.75rem;margin-bottom:1.25rem;",
      badge: "background:#22c55e;color:#fff;font-size:1rem;font-weight:800;padding:0.45rem 1rem;border-radius:7px;display:inline-block;",
    };
  }
  if (decision === "OPTION B") {
    return {
      wrap: "background:#fffbf0;border:3px solid #f59e0b;border-radius:10px;padding:1.5rem 1.75rem;margin-bottom:1.25rem;",
      badge: "background:#f59e0b;color:#fff;font-size:1rem;font-weight:800;padding:0.45rem 1rem;border-radius:7px;display:inline-block;",
    };
  }
  return {
    wrap: "background:#fff5f5;border:3px solid #ef4444;border-radius:10px;padding:1.5rem 1.75rem;margin-bottom:1.25rem;",
    badge: "background:#b91c1c;color:#fff;font-size:1rem;font-weight:800;padding:0.45rem 1rem;border-radius:7px;display:inline-block;",
  };
}

function verdictBadgeLabel(decision: PrePurchaseDecision): string {
  if (decision === "OPTION A") return "OPTION A — PROCEED";
  if (decision === "OPTION B") return "OPTION B — PROCEED WITH BUDGET";
  return "OPTION C — HIGH PRIORITY RISKS";
}

function cardClassForLabel(label: string): string {
  const u = label.toUpperCase();
  if (u.includes("PRIORITY")) return "finding-item priority";
  if (u.includes("PLAN") || u.includes("0–3") || u.includes("0-3")) return "finding-item plan";
  return "finding-item advisory";
}

function pillClassForLabel(label: string): string {
  const u = label.toUpperCase();
  if (u.includes("PRIORITY")) return "pill pill-priority";
  if (u.includes("PLAN")) return "pill pill-plan";
  return "pill pill-advisory";
}

function renderFindingCard(card: PrePurchaseFindingCard, index: number): string {
  const cls = cardClassForLabel(card.priority_label);
  const pillCls = pillClassForLabel(card.priority_label);
  const body = card.description
    ? `<div class="finding-body" style="font-size:0.875rem;color:#555;line-height:1.6;margin-top:0.35rem;">${escapeHtml(card.description)}</div>`
    : "";
  const loc = card.location
    ? `<div class="finding-meta" style="font-size:0.8rem;color:#666;margin-top:0.35rem;">Location: ${escapeHtml(card.location)}</div>`
    : "";
  const cost =
    card.estimated_cost && card.estimated_cost.trim()
      ? `<div class="finding-cost" style="font-size:0.8rem;margin-top:0.5rem;"><strong>Est. cost:</strong> ${escapeHtml(card.estimated_cost)}</div>`
      : "";
  const rec =
    card.recommended_action && card.recommended_action.trim()
      ? `<div style="font-size:0.8rem;margin-top:0.35rem;"><strong>Recommended action:</strong> ${escapeHtml(card.recommended_action)}</div>`
      : "";
  return `<div class="${cls}" style="border:1px solid #e0e0e0;border-radius:8px;padding:1rem 1.15rem;margin-bottom:0.65rem;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:0.25rem;">
    <div style="font-weight:600;font-size:0.9rem;">Finding ${index + 1} — ${escapeHtml(card.title)}</div>
    <span class="${pillCls}" style="display:inline-block;padding:0.12rem 0.5rem;border-radius:4px;font-size:0.7rem;font-weight:700;white-space:nowrap;">${escapeHtml(card.priority_label)}</span>
  </div>
  ${body}
  ${loc}
  ${rec}
  ${cost}
</div>`;
}

export function renderPrePurchaseSampleReport(summary: PrePurchaseSampleSummary): string {
  const { wrap: verdictWrap, badge: badgeStyle } = verdictStyles(summary.decision);
  const d = summary.property_details;

  const metaRows: Array<[string, string]> = [
    ["Property address", d.address || "—"],
    ["Prepared for", d.prepared_for || "—"],
    ["Inspection date", d.assessment_date || "—"],
    ["Prepared by", d.prepared_by || "—"],
    ["Property type", d.property_type || "—"],
    ["Inspection ID", d.inspection_id || "—"],
  ];
  const metaHtml = metaRows
    .map(
      ([label, val]) =>
        `<div class="meta-item" style="padding:0.35rem 0;"><span style="display:block;font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#666;margin-bottom:0.15rem;">${escapeHtml(label)}</span><span style="font-size:0.9rem;font-weight:500;">${escapeHtml(val)}</span></div>`
    )
    .join("");

  const inspectionIdForCta = String(summary.property_details?.inspection_id ?? "").trim();
  const inspectionIdLiteral = JSON.stringify(inspectionIdForCta);

  const budgetBlock =
    summary.budget_range && summary.budget_range.trim()
      ? `<div style="margin:1rem 0;padding:0.85rem 1rem;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:0.9rem;"><strong>Indicative remediation budget (planning):</strong> ${escapeHtml(summary.budget_range)}</div>`
      : "";

  const urgencyBlock = summary.urgent_action_required
    ? `<div style="margin:0 0 1rem;padding:0.75rem 1rem;background:#fff5f5;border:1px solid #fecaca;border-radius:8px;color:#991b1b;font-size:0.88rem;font-weight:600;">Urgent electrical items require attention before proceeding.</div>`
    : "";

  const findingsHtml =
    summary.key_findings.length > 0
      ? summary.key_findings.map((c, i) => renderFindingCard(c, i)).join("\n")
      : `<p style="color:#666;font-size:0.9rem;">No automated findings were recorded for this inspection.</p>`;

  const items = Array.isArray(summary.repair_items) ? summary.repair_items : [];
  const repairEstimateSection =
    items.length > 0
      ? `<section style="margin-top:1.75rem;">
  <h3 style="margin:0 0 0.65rem;font-size:1.05rem;font-weight:700;color:#1a1a1a;">Estimated Repair Costs</h3>
  ${items
    .map((item) => {
      const low = item.estimated_cost_low;
      const high = item.estimated_cost_high;
      const range =
        typeof low === "number" &&
        typeof high === "number" &&
        Number.isFinite(low) &&
        Number.isFinite(high)
          ? `$${low.toLocaleString("en-AU")} – $${high.toLocaleString("en-AU")}`
          : "—";
      return `<div style="border-bottom:1px solid #eee;padding:8px 0;">
      <strong>${escapeHtml(item.title)}</strong><br/>
      <small style="color:#555;">${escapeHtml(item.category)} | ${escapeHtml(item.priority)}</small><br/>
      <span style="font-size:0.95rem;">${range}</span>
    </div>`;
    })
    .join("")}
  <p style="margin:0.85rem 0 0;font-size:0.8rem;color:#555;line-height:1.45;font-style:italic;">Note: Estimates are indicative only. Final quote required after detailed inspection.</p>
  ${
    inspectionIdForCta
      ? `<div style="margin-top:14px;">
    <button type="button" style="padding:8px 14px;font-size:0.9rem;cursor:pointer;border:1px solid #ccc;border-radius:6px;background:#fff;" onclick="generateQuote()">Get Repair Quote</button>
  </div>`
      : ""
  }
</section>`
      : "";

  const tech = summary.technical_risk_profile
    ? `<p style="margin:0.75rem 0 0;font-size:0.78rem;color:#555;">Technical risk profile (planning label): <strong>${escapeHtml(summary.technical_risk_profile)}</strong></p>`
    : "";

  const decisionItems = (summary.decision_explanation || []).map((s) => String(s).trim()).filter(Boolean);
  const decisionExplanationSection =
    decisionItems.length > 0
      ? `<section style="margin-top:1.25rem;">
  <h3 style="margin:0 0 0.5rem;font-size:1rem;font-weight:700;color:#1a1a1a;">Why this recommendation?</h3>
  <ul style="margin:0;padding-left:1.2rem;font-size:0.9rem;color:#333;line-height:1.55;">
    ${decisionItems.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
  </ul>
</section>`
      : "";

  const capexLine =
    summary.budget_range && String(summary.budget_range).trim()
      ? String(summary.budget_range).trim()
      : "No major costs identified";
  const basisTrim = (summary.budget_basis_text || "").trim();
  const budgetConfidenceSection =
    basisTrim.length > 0
      ? `<section style="margin-top:1.25rem;">
  <h3 style="margin:0 0 0.5rem;font-size:1rem;font-weight:700;color:#1a1a1a;">Budget Estimate</h3>
  <p style="margin:0 0 0.35rem;font-size:0.95rem;color:#1a1a1a;line-height:1.5;">${escapeHtml(capexLine)}</p>
  <small style="display:block;font-size:0.8rem;color:#555;line-height:1.45;">${escapeHtml(basisTrim)}</small>
</section>`
      : "";

  const guidanceItems = (summary.buyer_guidance || []).map((s) => String(s).trim()).filter(Boolean);

  const buyerGuidanceSection =
    guidanceItems.length > 0
      ? `<section style="border:2px solid #ddd;padding:16px;margin-top:16px;background:#f9fafb;border-radius:8px;">
  <h3 style="margin:0 0 0.65rem;font-size:1.05rem;font-weight:700;color:#1a1a1a;">What should you do next?</h3>
  <ul style="margin:0;padding-left:1.2rem;font-size:0.92rem;color:#1a1a1a;line-height:1.6;">
    ${guidanceItems.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
  </ul>
  <div style="margin-top:16px;display:flex;flex-wrap:wrap;gap:10px;">
    <button type="button" style="padding:8px 14px;font-size:0.9rem;cursor:pointer;border:1px solid #ccc;border-radius:6px;background:#fff;" onclick="handleReportAction('request_quote')">Request Repair Quote</button>
    <button type="button" style="padding:8px 14px;font-size:0.9rem;cursor:pointer;border:1px solid #ccc;border-radius:6px;background:#fff;" onclick="handleReportAction('book_job')">Book Electrician</button>
  </div>
</section>`
      : "";

  const reportActionsScript =
    guidanceItems.length > 0
      ? `<script>
function handleReportAction(action) {
  var inspectionId = ${inspectionIdLiteral};
  fetch("/api/report-actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inspection_id: inspectionId,
      action: action
    })
  }).then(function () {
    alert("Request received. We will contact you shortly.");
  });
}
</script>`
      : "";

  const generateQuoteScript =
    items.length > 0 && inspectionIdForCta
      ? `<script>
function generateQuote() {
  var inspectionId = ${inspectionIdLiteral};
  if (!inspectionId) {
    alert("Missing inspection reference.");
    return;
  }
  fetch("/api/generate-quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inspection_id: inspectionId })
  })
    .then(function (res) {
      return res.json().then(function (data) {
        return { ok: res.ok, data: data };
      });
    })
    .then(function (payload) {
      var data = payload.data;
      if (!payload.ok || !data || !data.ok) {
        alert(data && data.error ? data.error : "Could not generate quote.");
        return;
      }
      if (data.accept_url) {
        window.location.href = data.accept_url;
      } else {
        alert("Quote created but no accept URL was returned.");
      }
    })
    .catch(function () {
      alert("Could not generate quote. Please try again.");
    });
}
</script>`
      : "";

  const summaryParts = summary.summary_paragraph
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const partsForHtml = summaryParts.length > 0 ? summaryParts : [summary.summary_paragraph];
  const summaryHtml = partsForHtml
    .map(
      (para, i) =>
        `<p style="margin:${i === 0 ? "0" : "0.65rem"} 0 0;line-height:1.65;font-size:0.9rem;color:#1a1a1a;">${escapeHtml(para)}</p>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(summary.title)}</title>
  <style>
    body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; font-size:14px; color:#1a1a1a; background:#f5f5f5; line-height:1.5; }
    .page { max-width:820px; margin:0 auto; background:#fff; padding:0 0 2rem; }
    .report-header { padding:2rem 2rem 1.25rem; border-bottom:3px solid #1a1a1a; }
    .report-body { padding:1.5rem 2rem 2rem; }
    .section-title { font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:#555; border-bottom:1px solid #e0e0e0; padding-bottom:0.45rem; margin:0 0 1rem; }
    .finding-item.priority { border-color:#ffb3b3 !important; background:#fff5f5; }
    .finding-item.plan { border-color:#ffd980 !important; background:#fffbf0; }
    .finding-item.advisory { border-color:#bfdbfe !important; background:#f0f6ff; }
    .pill-priority { background:#fff5f5;color:#c00;border:1px solid #ffb3b3; }
    .pill-plan { background:#fffbf0;color:#7a5500;border:1px solid #ffd980; }
    .pill-advisory { background:#f0f6ff;color:#1d4ed8;border:1px solid #bfdbfe; }
  </style>
</head>
<body>
<div class="page">
  <div class="report-header">
    <div style="font-weight:700;font-size:1.05rem;margin-bottom:0.25rem;">Better Home Technology</div>
    <h1 style="font-size:1.45rem;font-weight:700;margin:0.75rem 0 0.25rem;letter-spacing:-0.02em;">${escapeHtml(summary.title)}</h1>
    <p style="margin:0;color:#555;font-size:0.9rem;">${escapeHtml(summary.subtitle)}</p>
  </div>
  <div class="report-body">
    <div class="section-title">1. Executive summary</div>
    <div style="${verdictWrap}">
      <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:0.75rem;">
        <span style="${badgeStyle}">${escapeHtml(verdictBadgeLabel(summary.decision))}</span>
        <span style="font-size:0.9rem;color:#555;font-style:italic;max-width:100%;">${escapeHtml(summary.decision_tagline)}</span>
      </div>
      ${summaryHtml}
      ${tech}
    </div>
    ${decisionExplanationSection}
    ${budgetConfidenceSection}

    <div class="section-title" style="margin-top:1.75rem;">2. Property &amp; inspection details</div>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.5rem 1.25rem;margin-bottom:1.25rem;">
      ${metaHtml}
    </div>

    <div class="section-title">3. Budget &amp; urgency</div>
    ${urgencyBlock}
    ${budgetBlock}
    ${!summary.budget_range && !summary.urgent_action_required ? `<p style="color:#666;font-size:0.88rem;margin:0;">No separate budget line was generated; see individual findings for any stated estimates.</p>` : ""}

    <div class="section-title" style="margin-top:1.75rem;">5. Key findings</div>
    ${findingsHtml}
    ${repairEstimateSection}
    ${buyerGuidanceSection}

    <div class="section-title" style="margin-top:1.75rem;">6. Limitations</div>
    <p style="margin:0;font-size:0.88rem;color:#444;line-height:1.65;white-space:pre-wrap;">${escapeHtml(summary.limitations_text || "")}</p>

    <div class="section-title" style="margin-top:1.75rem;">7. Declaration</div>
    <p style="margin:0;font-size:0.88rem;color:#444;line-height:1.65;">${escapeHtml(summary.declaration || "")}</p>
  </div>
</div>
${reportActionsScript}
${generateQuoteScript}
</body>
</html>`;
}
