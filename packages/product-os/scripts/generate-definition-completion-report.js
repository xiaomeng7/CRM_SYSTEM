#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const {
  GENERATED_DIR,
  ensureDir,
  loadDefinitions
} = require("./lib/product-definition-utils");
const { scanMarkers } = require("./lib/definition-markers");

function hasValue(v) {
  return v !== undefined && v !== null && String(v).trim() !== "";
}

function sectionStatus(name, complete, detail) {
  return { name, complete, detail };
}

function countMarkers(obj) {
  return scanMarkers(obj).length;
}

function evaluateDefinition(def, validationMap) {
  const d = def.data;
  const product = d.product || {};
  const isFoundation = product.code === "FOUNDATION";
  const validationResult = validationMap.get(product.code) || null;
  const validationPass = validationResult ? validationResult.valid : false;

  const sections = [];
  sections.push(
    sectionStatus(
      "Product",
      hasValue(product.code) &&
        hasValue(product.name) &&
        hasValue(product.type) &&
        hasValue(product.version) &&
        hasValue(product.status) &&
        hasValue(product.core_value) &&
        hasValue(product.primary_emotion) &&
        hasValue(product.coverage) &&
        hasValue(product.final_installed_price) &&
        typeof product.requires_foundation === "boolean" &&
        hasValue(product.notes),
      product.name || ""
    )
  );
  sections.push(sectionStatus("Hero", hasValue(d.hero), d.hero || ""));
  sections.push(
    sectionStatus("Subtitle", hasValue(d.subtitle), d.subtitle || "")
  );
  sections.push(sectionStatus("Story", hasValue(d.story), d.story || ""));

  const experiences = Array.isArray(d.experiences) ? d.experiences : [];
  const minExp = isFoundation ? 2 : 4;
  sections.push(
    sectionStatus(
      "Experiences",
      experiences.length >= minExp &&
        experiences.every(
          (x) =>
            hasValue(x.title) &&
            hasValue(x.subtitle) &&
            hasValue(x.description) &&
            hasValue(x.sequence)
        ),
      `count=${experiences.length}`
    )
  );

  const capabilities = Array.isArray(d.capabilities) ? d.capabilities : [];
  sections.push(
    sectionStatus(
      "Capabilities",
      capabilities.length >= 4 && capabilities.every((x) => hasValue(x.capability)),
      `count=${capabilities.length}`
    )
  );

  const bom = Array.isArray(d.bom) ? d.bom : [];
  sections.push(
    sectionStatus(
      "BOM",
      bom.length >= 3 && bom.every((x) => hasValue(x.sku) && hasValue(x.qty)),
      `count=${bom.length}`
    )
  );

  const labour = Array.isArray(d.labour) ? d.labour : [];
  sections.push(
    sectionStatus(
      "Labour",
      labour.length >= 4 &&
        labour.every((x) => hasValue(x.labour_item) && hasValue(x.hours)),
      `count=${labour.length}`
    )
  );

  sections.push(
    sectionStatus(
      "Pricing",
      d.pricing && hasValue(d.pricing.final_installed_price),
      d.pricing ? String(d.pricing.final_installed_price) : ""
    )
  );

  const content = Array.isArray(d.content) ? d.content : [];
  const minContent = isFoundation ? 6 : 8;
  sections.push(
    sectionStatus(
      "Content",
      content.length >= minContent,
      `count=${content.length}`
    )
  );

  const automation = Array.isArray(d.automation) ? d.automation : [];
  sections.push(
    sectionStatus(
      "Automation",
      automation.length >= 1 &&
        automation.every(
          (x) =>
            hasValue(x.automation_name) &&
            hasValue(x.trigger) &&
            hasValue(x.condition) &&
            hasValue(x.action)
        ),
      `count=${automation.length}`
    )
  );

  const icons = Array.isArray(d.icons) ? d.icons : [];
  sections.push(
    sectionStatus(
      "Icons",
      icons.length >= minExp,
      `count=${icons.length}`
    )
  );

  const theme = Array.isArray(d.theme) ? d.theme : [];
  sections.push(
    sectionStatus("Theme", theme.length >= 1, `count=${theme.length}`)
  );

  const layout = Array.isArray(d.layout) ? d.layout : [];
  sections.push(
    sectionStatus("Layout", layout.length >= 1, `count=${layout.length}`)
  );

  const images = Array.isArray(d.images) ? d.images : [];
  sections.push(
    sectionStatus("Images", images.length >= 1, `count=${images.length}`)
  );

  const rules = Array.isArray(d.rules) ? d.rules : [];
  sections.push(sectionStatus("Rules", rules.length >= 1, `count=${rules.length}`));
  sections.push(sectionStatus("Notes", hasValue(d.notes), d.notes || ""));

  const baseTotal = sections.length;
  const baseScore = sections.filter((s) => s.complete).length;
  const markerCount = countMarkers(d);
  const structurePass = baseScore === baseTotal;
  const percent = structurePass && markerCount === 0 && validationPass ? 100 : 0;

  return {
    productName: product.name || def.fileName,
    productCode: product.code || null,
    completionPercent: percent,
    sections,
    unresolvedMarkers: markerCount,
    validationPass,
    releaseReady: percent === 100
  };
}

function generateCompletionReport(validationReport) {
  const definitions = loadDefinitions();
  const validationResults = (validationReport && validationReport.results) || [];
  const validationMap = new Map(
    validationResults.map((result) => [result.productCode, result])
  );
  const products = definitions.map((def) => evaluateDefinition(def, validationMap));
  const report = {
    generatedAt: new Date().toISOString(),
    rule:
      "100% requires: no TODO/UNKNOWN/QUESTION/MISSING, validation pass, and all required sections complete.",
    products
  };

  ensureDir(GENERATED_DIR);
  const outputPath = path.join(GENERATED_DIR, "definition-completion-report.json");
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");

  return { report, outputPath, products };
}

function main() {
  const validationPath = path.join(GENERATED_DIR, "validation-report.json");
  const validationReport = fs.existsSync(validationPath)
    ? JSON.parse(fs.readFileSync(validationPath, "utf8"))
    : { results: [] };
  const { outputPath, products } = generateCompletionReport(validationReport);
  console.log("=== Product Definition Completion Report ===");
  for (const p of products) {
    console.log(`${p.productName} (${p.productCode}): ${p.completionPercent}%`);
  }
  console.log(`Report: ${path.relative(process.cwd(), outputPath)}`);

  if (products.some((p) => p.completionPercent < 100)) {
    console.log("Release gate: BLOCKED (at least one product below 100%).");
  } else {
    console.log("Release gate: PASS (all products at 100%).");
    console.log("Product Ready For Release");
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  generateCompletionReport
};
