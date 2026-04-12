import type { RentalActionItem, RentalSampleSummary, RentalSimpleSection } from "./buildRentalSampleSummary";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderActionItems(actionItems: RentalActionItem[]): string {
  if (actionItems.length === 0) {
    return `<div class="finding-item finding-info"><div class="finding-title">None identified</div></div>`;
  }
  return actionItems
    .map((item, idx) => {
      const cls = item.tag === "ACTION REQUIRED" ? "finding-warn" : "finding-info";
      const description = item.description ? `<div class="finding-body">${escapeHtml(item.description)}</div>` : "";
      const action = item.recommended_action
        ? `<div class="finding-action"><strong>Recommended action:</strong> ${escapeHtml(item.recommended_action)}</div>`
        : "";
      const location = item.location ? `<div class="finding-meta">Location: ${escapeHtml(item.location)}</div>` : "";
      return `<div class="finding-item ${cls}">
  <div class="finding-header">
    <div class="finding-title">Item ${idx + 1} - ${escapeHtml(item.title)}</div>
    <span class="pill ${item.tag === "ACTION REQUIRED" ? "pill-warn" : "pill-na"}">${escapeHtml(item.tag)}</span>
  </div>
  ${location}
  ${description}
  ${action}
</div>`;
    })
    .join("\n");
}

function renderSection(title: string, section: RentalSimpleSection | null | undefined): string {
  if (!section || section.items.length === 0) return "";
  const rows = section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const note = section.note ? `<p class="muted">${escapeHtml(section.note)}</p>` : "";
  return `<div class="section">
  <div class="section-title">${escapeHtml(title)}</div>
  <ul class="summary-list">${rows}</ul>
  ${note}
</div>`;
}

function renderEvidence(summary: RentalSampleSummary): string {
  if (summary.evidence_items.length === 0) return "";
  const items = summary.evidence_items
    .map((item) => {
      const title = item.finding_title ? escapeHtml(item.finding_title) : "Finding";
      const location = item.location ? ` (${escapeHtml(item.location)})` : "";
      const photos = item.photo_ids.map((id) => `<span class="photo-pill">${escapeHtml(id)}</span>`).join(" ");
      return `<li><strong>${title}</strong>${location}<div class="photo-wrap">${photos}</div></li>`;
    })
    .join("");
  return `<div class="section">
  <div class="section-title">Evidence</div>
  <ul class="summary-list">${items}</ul>
</div>`;
}

export function renderRentalSampleReport(summary: RentalSampleSummary): string {
  const statusClass = summary.overall_result === "PASS" ? "status-pass" : "status-warn";
  const details = summary.property_details;
  const propertyRows = [
    ["Property address", details.address || "N/A"],
    ["Prepared for", details.client_name || "N/A"],
    ["Inspection date", details.assessment_date || "N/A"],
    ["Prepared by", details.prepared_by || "N/A"],
    ["Property type", details.property_type || "N/A"],
    ["Inspection ID", details.inspection_id || "N/A"],
  ]
    .map(
      ([label, value]) =>
        `<div class="meta-item"><label>${escapeHtml(label)}</label><span>${escapeHtml(String(value))}</span></div>`
    )
    .join("");

  const limitations = summary.limitations_text
    ? `<div class="section"><div class="section-title">Scope &amp; Limitations</div><p class="muted">${escapeHtml(summary.limitations_text)}</p></div>`
    : "";
  const declaration = summary.declaration
    ? `<div class="section"><div class="section-title">Declaration</div><p class="muted">${escapeHtml(summary.declaration)}</p></div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(summary.title)}</title>
  <style>
    body { margin: 0; background: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1a1a1a; }
    .page { max-width: 860px; margin: 0 auto; background: #fff; }
    .report-header { padding: 2rem 2rem 1.5rem; border-bottom: 3px solid #1a1a1a; }
    .report-title { margin: 0; font-size: 1.6rem; letter-spacing: -0.02em; }
    .report-subtitle { margin: .35rem 0 0; color: #555; }
    .report-body { padding: 1.8rem 2rem 2rem; }
    .section { margin-bottom: 1.8rem; }
    .section-title { font-size: 0.78rem; font-weight: 700; text-transform: uppercase; color: #555; letter-spacing: 0.08em; border-bottom: 1px solid #e0e0e0; padding-bottom: .45rem; margin-bottom: .85rem; }
    .status-badge { display: inline-flex; align-items: center; padding: .5rem .95rem; border-radius: 6px; font-size: .86rem; font-weight: 700; border: 1px solid transparent; }
    .status-pass { background: #f0faf4; border-color: #b6e2c8; color: #1a7a3a; }
    .status-warn { background: #fffbf0; border-color: #ffd980; color: #7a5500; }
    .meta-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .8rem 1.1rem; }
    .meta-item label { display: block; font-size: .7rem; text-transform: uppercase; color: #666; margin-bottom: .15rem; }
    .meta-item span { font-size: .92rem; }
    .summary-box { background: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 8px; padding: 1rem 1.15rem; }
    .summary-list { margin: 0; padding-left: 1.1rem; }
    .summary-list li { margin: .4rem 0; line-height: 1.45; }
    .finding-item { border: 1px solid #e0e0e0; border-radius: 8px; padding: .95rem 1.05rem; margin-bottom: .7rem; }
    .finding-warn { background: #fffbf0; border-color: #ffd980; }
    .finding-info { background: #fafafa; }
    .finding-header { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; margin-bottom: .35rem; }
    .finding-title { font-size: .93rem; font-weight: 650; }
    .finding-meta, .finding-body, .finding-action, .muted { color: #555; font-size: .88rem; line-height: 1.55; }
    .pill { display: inline-block; border-radius: 4px; padding: .16rem .45rem; font-size: .74rem; font-weight: 600; }
    .pill-warn { background: #fffbf0; color: #7a5500; border: 1px solid #ffd980; }
    .pill-na { background: #f0f0f0; color: #666; }
    .photo-wrap { margin-top: .35rem; }
    .photo-pill { display: inline-block; font-size: .75rem; border: 1px solid #ddd; border-radius: 999px; padding: .12rem .5rem; margin: .15rem .2rem .05rem 0; }
  </style>
</head>
<body>
  <div class="page">
    <div class="report-header">
      <h1 class="report-title">${escapeHtml(summary.title)}</h1>
      <p class="report-subtitle">${escapeHtml(summary.subtitle)}</p>
    </div>
    <div class="report-body">
      <div style="display:none">SENTINEL_FINDINGS_V1</div>
      <div class="section">
        <div class="section-title">Overall Result</div>
        <span class="status-badge ${statusClass}">${escapeHtml(summary.overall_result)}</span>
      </div>
      <div class="section">
        <div class="section-title">Summary</div>
        <div class="summary-box"><p class="muted">${escapeHtml(summary.summary_paragraph)}</p></div>
      </div>
      <div class="section">
        <div class="section-title">Property &amp; Inspection Details</div>
        <div class="meta-grid">${propertyRows}</div>
      </div>
      ${renderSection("RCD / Safety Switch", summary.rcd_summary)}
      ${renderSection("Switchboard", summary.switchboard_summary)}
      ${renderSection("Smoke Alarms", summary.smoke_alarm_summary)}
      ${renderSection("General Power Outlets & Lighting", summary.gpo_lighting_summary)}
      ${renderSection("Hot Water", summary.hot_water_summary)}
      <div class="section">
        <div class="section-title">Findings &amp; Recommended Actions</div>
        ${renderActionItems(summary.action_items)}
      </div>
      ${renderEvidence(summary)}
      ${limitations}
      ${declaration}
    </div>
  </div>
</body>
</html>`;
}
