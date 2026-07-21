#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const {
  GENERATED_DIR,
  REQUIRED_TOP_LEVEL_KEYS,
  ensureDir,
  loadDefinitions
} = require("./lib/product-definition-utils");

const MIN_EXPERIENCE_COUNT = 1;
const MAX_EXPERIENCE_COUNT = 12;
const ALLOWED_PRODUCT_TYPES = new Set([
  "INFRASTRUCTURE",
  "COLLECTION",
  "EXPERIENCE_PACK"
]);

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function validateDefinition({ fileName, data }, usedCodes) {
  const errors = [];
  const warnings = [];

  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    if (!(key in data)) {
      errors.push(`Missing required key: ${key}`);
    }
  }

  const product = data.product || {};
  const code = String(product.code || "").trim();
  const productType = String(product.type || "").trim().toUpperCase();
  if (!/^[A-Z0-9_]+$/.test(code)) {
    errors.push("Invalid product.code format (expect UPPER_SNAKE_CASE).");
  }
  if (!ALLOWED_PRODUCT_TYPES.has(productType)) {
    errors.push(
      `Invalid product.type: ${product.type || "N/A"} (allowed: INFRASTRUCTURE, COLLECTION, EXPERIENCE_PACK).`
    );
  }
  if (usedCodes.has(code)) {
    errors.push(`Duplicate product.code detected: ${code}`);
  } else if (!isBlank(code)) {
    usedCodes.add(code);
  }

  if (isBlank(data.hero)) errors.push("Hero is empty.");
  if (isBlank(data.subtitle)) errors.push("Subtitle is empty.");
  if (!data.pricing || data.pricing.final_installed_price === undefined) {
    errors.push("Pricing missing: pricing.final_installed_price is required.");
  }

  if (!Array.isArray(data.experiences)) {
    errors.push("experiences must be an array.");
  } else if (
    data.experiences.length < MIN_EXPERIENCE_COUNT ||
    data.experiences.length > MAX_EXPERIENCE_COUNT
  ) {
    errors.push(
      `Invalid experiences count: ${data.experiences.length} (expected ${MIN_EXPERIENCE_COUNT}-${MAX_EXPERIENCE_COUNT}).`
    );
  }

  const bom = Array.isArray(data.bom) ? data.bom : [];
  const skuSet = new Set();
  for (const item of bom) {
    const sku = String(item.sku || "").trim();
    if (isBlank(sku)) {
      errors.push("BOM contains empty sku reference.");
      continue;
    }
    if (skuSet.has(sku)) {
      errors.push(`Duplicate SKU in bom: ${sku}`);
    } else {
      skuSet.add(sku);
    }
  }

  const capabilities = Array.isArray(data.capabilities) ? data.capabilities : [];
  const capabilitySet = new Set();
  for (const item of capabilities) {
    const capability = String(item.capability || "").trim().toLowerCase();
    if (isBlank(capability)) {
      errors.push("capabilities contains empty capability.");
      continue;
    }
    if (capabilitySet.has(capability)) {
      errors.push(`Duplicate capability: ${item.capability}`);
    } else {
      capabilitySet.add(capability);
    }
  }

  const labour = Array.isArray(data.labour) ? data.labour : [];
  const labourSet = new Set();
  for (const item of labour) {
    const labourItem = String(item.labour_item || "").trim();
    if (isBlank(labourItem)) {
      errors.push("labour contains empty labour_item reference.");
      continue;
    }
    if (labourSet.has(labourItem)) {
      warnings.push(`Duplicate labour_item definition: ${labourItem}`);
    } else {
      labourSet.add(labourItem);
    }
  }

  for (const item of bom) {
    if (isBlank(item.sku)) {
      errors.push("Referenced SKU does not exist in bom entry.");
    }
  }
  for (const item of labour) {
    if (isBlank(item.labour_item)) {
      errors.push("Referenced labour item does not exist.");
    }
  }

  return {
    fileName,
    productCode: code || null,
    valid: errors.length === 0,
    errors,
    warnings
  };
}

function generateValidationReport() {
  const definitions = loadDefinitions();
  const usedCodes = new Set();
  const results = definitions.map((def) => validateDefinition(def, usedCodes));
  const validCount = results.filter((r) => r.valid).length;
  const invalidCount = results.length - validCount;

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalDefinitions: results.length,
      validDefinitions: validCount,
      invalidDefinitions: invalidCount
    },
    results
  };

  ensureDir(GENERATED_DIR);
  const reportPath = path.join(GENERATED_DIR, "validation-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  return { report, reportPath, invalidCount, results };
}

function main() {
  const { reportPath, invalidCount, results } = generateValidationReport();
  console.log("=== Product Definition Validation Report ===");
  console.log(`Total: ${results.length}`);
  console.log(`Valid: ${results.filter((r) => r.valid).length}`);
  console.log(`Invalid: ${invalidCount}`);
  console.log(`Report: ${path.relative(process.cwd(), reportPath)}`);

  for (const item of results) {
    const status = item.valid ? "PASS" : "FAIL";
    console.log(`- [${status}] ${item.fileName} (${item.productCode || "N/A"})`);
    for (const error of item.errors) {
      console.log(`    error: ${error}`);
    }
    for (const warning of item.warnings) {
      console.log(`    warn: ${warning}`);
    }
  }

  if (invalidCount > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  validateDefinition,
  generateValidationReport
};
