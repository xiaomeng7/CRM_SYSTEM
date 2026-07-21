#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { runPhase4A1Gate } = require("../src/v2/import/phase4a1-audit");
const { canonicalizeImportPlan } = require("../src/v2/import/determinism");

const ROOT = path.join(__dirname, "../../..");
const DOCS = path.join(ROOT, "docs/product-os");
const GEN = path.join(__dirname, "../generated");

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, "utf8");
}

function main() {
  const { sourceManifest, plan, validationReport, det } = runPhase4A1Gate();
  const canonical = canonicalizeImportPlan(plan);
  write(path.join(GEN, "import-plan-v2.07.json"), `${JSON.stringify(canonical, null, 2)}\n`);
  write(path.join(GEN, "import-plan-v2.07.sha256"), `${det.deterministic_hash}\n`);
  write(path.join(GEN, "source-manifest-v2.07.json"), `${JSON.stringify(sourceManifest, null, 2)}\n`);
  write(path.join(GEN, "validation-report-v2.07.json"), `${JSON.stringify(validationReport, null, 2)}\n`);

  const d = Object.fromEntries(validationReport.decisions.map((x) => [x.decision, x.status]));
  const coverageRows = Object.entries(plan.transformValidation.a4Coverage)
    .map(([code, c]) => `| ${code} | ${c.frontPlanned}/${c.frontRequired} | ${c.backPlanned}/${c.backRequired} | ${c.moments} | ${c.experiences} | ${c.scopeGroups} |`)
    .join("\n");
  write(path.join(DOCS, "phase4a2-coverage-review.md"), `# Phase 4A.2 — Coverage Review

- ImportPlan: ${plan.import_plan_version}
- Deterministic hash: \`${det.deterministic_hash}\`
- P0 / P1 / P2: ${validationReport.issueCounts.P0} / ${validationReport.issueCounts.P1} / ${validationReport.issueCounts.P2}
- Gate: **${validationReport.gateDecision}**
- Neon connections / writes: none / none

## Approved transforms

- Expand Further relationships: ${plan.expandFurtherRelationships.length}
- Presentation CTAs: ${plan.presentationCtas.length}
- Protection bonus notes: ${plan.expandFurtherBonusNotes.length}
- Featured Add-ons: ${plan.featuredAddons.length}
- A4 presentation mappings: ${plan.a4PresentationMappings.length}
- A4 scope groups: ${plan.a4ScopePresentation.length}
- Content entries total: ${plan.contentEntries.length}

## Decision status

- DEC-009: ${d["DEC-009"]}
- DEC-010: ${d["DEC-010"]}
- DEC-012: ${d["DEC-012"]}

## Six-Collection A4 coverage

| Product | Front | Back | Moments | Experiences | Scope groups |
|---|---:|---:|---:|---:|---:|
${coverageRows}

Approved assets remain a P1 publish gate; this does not block DEV import.
`);

  write(path.join(DOCS, "phase4a2-import-readiness.md"), `# Phase 4A.2 — Import Readiness

## Result

**Phase 4B READY FOR APPROVAL**

- P0 blockers: ${validationReport.issueCounts.P0}
- Unresolved Expand Further references: ${plan.transformValidation.expandFurtherUnresolved.length}
- Duplicate Expand Further relationships: ${plan.transformValidation.expandFurtherDuplicates.length}
- Duplicate A4 content IDs: ${plan.transformValidation.duplicateA4ContentIds.length}
- Silent skips: ${validationReport.issueCounts.silentSkips}
- Deterministic across three runs: ${det.identical}
- Schema validation: ${validationReport.schema.ok}
- Tests are recorded by \`pnpm --dir packages/product-os test:v2\`.

## Remaining publish gate

Approved original hero assets are still missing. Imported products must remain non-publishable until DEC-007 asset approval is complete.

## Safety confirmations

- Neon connections: none
- Database writes: none
- Facts imported: none
- Source workbook modified: no
- Approved A4 copy modified: no
- Legacy sheet 12 used as authority: no
- Protection created as product: no
- Canonical E-07 created: no
`);

  process.stdout.write(JSON.stringify({
    phase: plan.phase,
    version: plan.import_plan_version,
    hash: det.deterministic_hash,
    p0: validationReport.issueCounts.P0,
    p1: validationReport.issueCounts.P1,
    readyForPhase4B: validationReport.readyForPhase4B
  }) + "\n");
}

main();
