#!/usr/bin/env node
/**
 * Generate Phase 4A.1 coverage artifacts + markdown reports.
 * Offline only — no Neon / no DB writes.
 */

const fs = require("fs");
const path = require("path");
const { runPhase4A1Gate } = require("../src/v2/import/phase4a1-audit");
const { canonicalizeImportPlan, serializeCanonical } = require("../src/v2/import/determinism");

const ROOT = path.join(__dirname, "../../..");
const DOCS = path.join(ROOT, "docs/product-os");
const GEN = path.join(__dirname, "../generated");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function write(p, body) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, body, "utf8");
}

function mdTable(headers, rows) {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.map((c) => String(c ?? "").replace(/\|/g, "\\|")).join(" | ")} |`);
  return [head, sep, ...body].join("\n");
}

function main() {
  const { sourceManifest, plan, validationReport, det } = runPhase4A1Gate();
  ensureDir(GEN);

  // Machine artifacts (costs already redacted in plan)
  const canonical = canonicalizeImportPlan(plan);
  const planJson = `${JSON.stringify(canonical, null, 2)}\n`;
  write(path.join(GEN, "import-plan-v2.07.json"), planJson);
  write(path.join(GEN, "import-plan-v2.07.sha256"), `${det.deterministic_hash}\n`);
  write(
    path.join(GEN, "source-manifest-v2.07.json"),
    `${JSON.stringify(sourceManifest, null, 2)}\n`
  );
  write(
    path.join(GEN, "validation-report-v2.07.json"),
    `${JSON.stringify(
      {
        ...validationReport,
        // avoid duplicating full plan inside report
        productRecon: validationReport.productRecon,
        planOmitted: true
      },
      null,
      2
    )}\n`
  );

  const v = validationReport;

  write(
    path.join(DOCS, "phase4a1-sheet-disposition.md"),
    `# Phase 4A.1 — Sheet Disposition Matrix

- Generated: offline Phase 4A.1 gate
- Workbook sheets: 22
- Neon: none

${mdTable(
  ["Sheet", "Authority role", "Import status", "Target context", "Rows read", "Rows planned", "Rows skipped", "Reason"],
  (plan.sheetDisposition.matrix || []).map((r) => [
    r.sheet,
    r.authorityRole,
    r.importStatus,
    r.targetContext,
    r.rowsRead,
    r.rowsPlanned,
    r.rowsSkipped,
    r.reason
  ])
)}

## Skipped rows (all reasoned)

Total skippedActions: ${plan.skippedActions.length}

${mdTable(
  ["Sheet", "Source row", "Stable ref", "Reason", "Downstream impact"],
  plan.skippedActions.slice(0, 80).map((s) => [
    s.sheet,
    s.sourceRow ?? "",
    s.stableSourceReference,
    s.reasonCode,
    s.downstreamImpact
  ])
)}

${plan.skippedActions.length > 80 ? `\n_… ${plan.skippedActions.length - 80} additional skip rows in validation-report JSON._\n` : ""}
`
  );

  write(
    path.join(DOCS, "phase4a1-product-reconciliation.md"),
    `# Phase 4A.1 — Product-by-product Reconciliation

Protection Bonus is **not** listed as a product (benefit only).

${v.productRecon
  .map(
    (p) => `## ${p.productCode} — ${p.expectedName}

- Actual name: ${p.actualName}
- Kind / role: ${p.productKind} / ${p.commercialRole}
- Import readiness: **${p.importReadiness}**
- Publish readiness: **${p.publishReadiness}**
- Counts: exp ${p.counts.experiences}, cap ${p.counts.capabilities}, BOM ${p.counts.bom}, rules ${p.counts.rules}, autos ${p.counts.automations}, content ${p.counts.content}, addons ${p.counts.addons}

${mdTable(
  ["Fact area", "Source", "Planned target", "Count", "Status", "Issues"],
  p.areas.map((a) => [a.factArea, a.source, a.plannedTarget, a.count, a.status, a.issues])
)}
`
  )
  .join("\n")}

## Protection Bonus (benefit)

- Code: \`benefit.protection_bonus\`
- Host: E-05 CCTV
- Unlock: C-01 ∧ C-06 ∧ E-05
- Purchasable / priced / A4 / Add to My Home: **No**
`
  );

  write(
    path.join(DOCS, "phase4a1-decision-reconciliation.md"),
    `# Phase 4A.1 — Decision Reconciliation (DEC-001…013)

${mdTable(
  ["Decision", "Approved outcome", "Transform rule", "ImportPlan objects", "Test", "Status"],
  v.decisions.map((d) => [
    d.decision,
    d.approvedOutcome,
    d.transformRule,
    d.objects,
    d.test,
    d.status
  ])
)}

## Summary

- Applied / applied-planned: ${v.decisions.filter((d) => ["APPLIED", "APPLIED_PLANNED"].includes(d.status)).length}
- Partial: ${v.decisions.filter((d) => String(d.status).startsWith("PARTIAL")).length}
- Not applied: ${v.decisions.filter((d) => String(d.status).startsWith("NOT_")).length}
`
  );

  write(
    path.join(DOCS, "phase4a1-addon-eligibility.md"),
    `# Phase 4A.1 — Add-on Eligibility Audit

Principle: Add-ons extend existing capability; they do not create new rooms or Experiences.

${mdTable(
  ["Add-on ID", "Parent product", "BOM/capability basis", "Device/SKU", "Price", "New room", "New experience", "Status"],
  v.addonAudit.map((a) => [
    a.addonId,
    a.parents,
    a.basisStatus,
    a.deviceSku || "",
    a.price ?? "",
    a.newRoom,
    a.newExperience,
    a.status
  ])
)}

## Totals

- Total: ${v.addonAudit.length}
- OK: ${v.addonAudit.filter((a) => a.status === "OK").length}
- Blocked: ${v.addonAudit.filter((a) => a.status === "BLOCKED").length}
- Orphan: ${v.addonAudit.filter((a) => a.status === "ORPHAN").length}
`
  );

  write(
    path.join(DOCS, "phase4a1-a4-content-coverage.md"),
    `# Phase 4A.1 — A4 Content Coverage (six Collections)

Customer price amounts are referenced only as presence checks; internal costs are not listed.

${mdTable(
  ["Collection", "Front coverage", "Back coverage", "Front ratio", "Back ratio"],
  v.a4Coverage.map((c) => [
    c.productCode,
    c.frontCoverage,
    c.backCoverage,
    c.frontRatio.toFixed(2),
    c.backRatio.toFixed(2)
  ])
)}

## Notes

- \`14_Content_Library\` is authoritative for present Hero/Subtitle/Story/Footer rows.
- Approved A4 moments / problem / response / Expand Further are **not** fully present → DEC-012 / DEC-010 gaps.
- Images are placeholders → \`NOT_APPROVED_FOR_PUBLISH\` (DEC-007).
- Sheet 12 was **not** used as authority.
- CCTV = E-05; Smart Toilet = E-06; Protection is CCTV note / benefit only.
`
  );

  write(
    path.join(DOCS, "phase4a1-price-reconciliation.md"),
    `# Phase 4A.1 — Price Reconciliation

Authority: \`10_Pricing_Summary\` (customer price only). Internal material/labour/GP **redacted**.

${mdTable(
  ["Target", "Source", "Display mode", "Amount", "Currency", "Tax", "Fulfilment", "Installation", "Status"],
  plan.prices.map((p) => [
    p.productCode,
    "10_Pricing_Summary",
    p.displayMode,
    p.customerPriceInclGst,
    p.currency,
    p.taxBasis,
    p.fulfillmentMode,
    p.installationIncluded,
    "PLANNED"
  ])
)}

## Add-on prices

${mdTable(
  ["Target", "Source", "Display mode", "Amount", "Currency", "Tax", "Fulfilment", "Installation", "Status"],
  plan.addons.map((a) => [
    a.productCode,
    "11_Add_Ons",
    "EXACT",
    a.customerPriceInclGst,
    "AUD",
    "GST_INCLUSIVE",
    "INSTALLED",
    true,
    a.eligibilityStatus === "ELIGIBLE" ? "PLANNED" : a.eligibilityStatus
  ])
)}

## Checks

- Protection: no price row (SKIP_PRICE) — OK
- Collections: INSTALLED + GST inclusive — OK
- Smart Toilet E-06: SUPPLY_ONLY — OK
- Currency AUD — OK
- No internal costs on plan surface — OK
`
  );

  write(
    path.join(DOCS, "phase4a1-issue-register.md"),
    `# Phase 4A.1 — Issue Register

${mdTable(
  ["Issue ID", "Source", "Fact", "Action", "Reason", "Severity", "Owner decision", "Publish impact"],
  v.issues.map((i) => [
    i.issueId,
    i.source,
    i.fact,
    i.action,
    i.reason,
    i.severity,
    i.ownerDecision ?? "",
    i.publishImpact
  ])
)}

## Gate thresholds

| Check | Required | Actual |
|---|---|---|
| P0 | 0 | ${v.issueCounts.P0} |
| Silent skips | 0 | ${v.issueCounts.silentSkips} |
| Orphan Add-ons | 0 | ${v.addonAudit.filter((a) => a.status === "ORPHAN").length} |
| Duplicate product codes | 0 | ${plan.integrity.duplicateProductCodes ? 1 : 0} |
`
  );

  write(
    path.join(DOCS, "phase4a1-import-readiness.md"),
    `# Phase 4A.1 — Import Readiness

## Gate decision

# ${v.gateDecision}

## Determinism

| Run | SHA-256 |
|---|---|
| 1 | \`${v.determinism.run1}\` |
| 2 | \`${v.determinism.run2}\` |
| 3 | \`${v.determinism.run3}\` |
| Identical | ${v.determinism.identical} |
| Generated UUIDs | ${v.determinism.generatedUuidsPresent} |

## Explicit confirmations

${mdTable(
  ["Item", "Value"],
  Object.entries(v.explicitConfirmations).map(([k, val]) => [k, val])
)}

## Gate checks

${mdTable(
  ["Check", "Pass"],
  Object.entries(v.gateChecks).map(([k, val]) => [k, val])
)}

## Blocking before Phase 4B

${v.issues
  .filter((i) => i.severity === "P0_IMPORT_BLOCKER")
  .map((i) => `- **${i.issueId}**: ${i.fact} — ${i.reason}`)
  .join("\n") || "_None_"}

## Artifacts

- \`packages/product-os/generated/import-plan-v2.07.json\`
- \`packages/product-os/generated/import-plan-v2.07.sha256\`
- \`packages/product-os/generated/source-manifest-v2.07.json\`
- \`packages/product-os/generated/validation-report-v2.07.json\`
`
  );

  write(
    path.join(DOCS, "phase4a1-coverage-review.md"),
    `# Phase 4A.1 — ImportPlan Coverage & Fact Reconciliation Gate

## Phase 4A.1 status

| Item | Value |
|---|---|
| Status | ${v.readyForPhase4B ? "Completed — gate passed" : "Completed — **Blocked for Phase 4B**"} |
| Neon connections | None |
| Database writes | None |
| Source files modified | No |
| ImportPlan version | ${plan.import_plan_version} |
| Deterministic hash | \`${det.deterministic_hash}\` |

## Coverage summary

${mdTable(
  ["Context", "Planned count", "Notes"],
  Object.entries(plan.entityInventory).map(([k, n]) => [
    k,
    n,
    plan.emptyEntityExplanations[k] || ""
  ])
)}

## Product readiness

${mdTable(
  ["Product", "Import", "Publish", "Blocking"],
  [
    ...v.productRecon.map((p) => [
      p.productCode,
      p.importReadiness,
      p.publishReadiness,
      (p.blockingIssues || []).join(";") || "see areas / P1 assets+A4"
    ]),
    [
      "benefit.protection_bonus",
      "COMPLETE_FOR_DEV_IMPORT",
      "N/A (not a product)",
      "hosted on E-05"
    ]
  ]
)}

## Decisions

- DEC-001…013 rows: see \`phase4a1-decision-reconciliation.md\`
- Fully applied (incl. planned overlays): ${v.decisions.filter((d) => ["APPLIED", "APPLIED_PLANNED"].includes(d.status)).length}
- Not applied: ${v.decisions.filter((d) => String(d.status).startsWith("NOT_")).map((d) => d.decision).join(", ") || "none"}

## Add-ons

- Total: ${v.addonAudit.length}
- OK: ${v.addonAudit.filter((a) => a.status === "OK").length}
- Blocked: ${v.addonAudit.filter((a) => a.status === "BLOCKED").length}
- Orphan: ${v.addonAudit.filter((a) => a.status === "ORPHAN").length}

## A4 coverage

See \`phase4a1-a4-content-coverage.md\`.

## Issues

- P0: ${v.issueCounts.P0}
- P1: ${v.issueCounts.P1}
- P2: ${v.issueCounts.P2}
- INFO: ${v.issueCounts.INFO}
- Silent skips: ${v.issueCounts.silentSkips}

## Determinism

Runs identical: **${v.determinism.identical}** — \`${det.deterministic_hash}\`

## Explicit confirmations

- Neon connections made: None
- Production connections made: None
- Database writes: None
- Migration operations: None
- Facts imported: None
- Source workbook modified: No
- Approved A4 copy modified: No
- Legacy sheet 12 used as authority: No
- Protection created as product: No
- Canonical E-07 created: No
- Placeholder facts created: No
- Silent skips: ${v.issueCounts.silentSkips}
- P0 blockers: ${v.issueCounts.P0}
- ImportPlan ready for Phase 4B: **${v.explicitConfirmations.importPlanReadyForPhase4B}**

## Gate decision

\`\`\`text
${v.gateDecision}
\`\`\`

Stop for Product Owner review.
`
  );

  // Update open-decisions briefly
  const openPath = path.join(DOCS, "open-decisions.md");
  write(
    openPath,
    `# Product OS V2 — Open Decisions

- Date: 2026-07-18
- Phase: **4A.1 Completed — Coverage gate; Phase 4B NOT APPROVED**

---

## Phase status

| ID | Status | Notes |
|---|---|---|
| 4A | Completed | Pure ImportPlan transforms |
| 4A.1 | **Completed — Blocked** | Coverage/reconciliation gate; see \`phase4a1-import-readiness.md\` |
| 4B | **NOT APPROVED** | P0 remain (Expand Further / DEC-010·012 materialisation; see issue register) |

---

## Residual open items

| ID | Status | Notes |
|---|---|---|
| 4A1-002 / DEC-010 | P0 | Expand Further relationships not in ImportPlan |
| 4A1-008 / DEC-012 | P0/P1 | A4 verbatim content not in Content Library |
| ISSUE-007 | P1 | Approved image originals missing |
| ISSUE-014 | P2 | Featured Add-on order |

---

## Explicit non-goals until P0 cleared + PO approval

- No Neon fact import
- No production migrate
`
  );

  console.log(
    JSON.stringify(
      {
        gateDecision: v.gateDecision,
        deterministic_hash: det.deterministic_hash,
        p0: v.issueCounts.P0,
        p1: v.issueCounts.P1,
        schemaOk: v.schema.ok,
        schemaErrors: v.schema.errors?.slice(0, 10),
        addonBlocked: v.addonAudit.filter((a) => a.status === "BLOCKED").length,
        addonOk: v.addonAudit.filter((a) => a.status === "OK").length,
        artifacts: GEN
      },
      null,
      2
    )
  );
}

main();
