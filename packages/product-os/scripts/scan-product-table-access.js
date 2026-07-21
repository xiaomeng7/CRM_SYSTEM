#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../..");
const scanTargets = ["apps", "packages"];
const ignoredDirs = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  "coverage"
]);
const tablePatterns = [
  "product_catalog",
  "product_bom",
  "sku_library",
  "labour_library",
  "product_labour",
  "product_experiences",
  "product_capabilities",
  "product_rules",
  "product_content",
  "product_icons",
  "product_images",
  "product_theme",
  "product_layout",
  "product_automation",
  "product_pricing_summary"
];
const extensionWhitelist = new Set([
  ".js",
  ".cjs",
  ".mjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".sql",
  ".md",
  ".json",
  ".yaml",
  ".yml"
]);
const ignoredPathFragments = [path.join("packages", "product-os")];

function shouldScanFile(filePath) {
  const relativePath = path.relative(repoRoot, filePath);
  if (ignoredPathFragments.some((fragment) => relativePath.startsWith(fragment))) {
    return false;
  }
  const ext = path.extname(filePath).toLowerCase();
  return extensionWhitelist.has(ext);
}

function walk(dirPath, output) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue;
      walk(fullPath, output);
      continue;
    }
    if (!shouldScanFile(fullPath)) continue;
    output.push(fullPath);
  }
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const hits = [];

  lines.forEach((line, index) => {
    const lowerLine = line.toLowerCase();
    for (const tableName of tablePatterns) {
      if (lowerLine.includes(tableName)) {
        hits.push({
          table: tableName,
          line: index + 1,
          snippet: line.trim().slice(0, 220)
        });
      }
    }
  });

  return hits;
}

function main() {
  const files = [];
  for (const target of scanTargets) {
    walk(path.join(repoRoot, target), files);
  }

  const results = [];
  for (const file of files) {
    const fileHits = scanFile(file);
    if (fileHits.length > 0) {
      results.push({
        file: path.relative(repoRoot, file),
        hits: fileHits
      });
    }
  }

  console.log("=== Product OS Table Access Audit ===");
  console.log(`Scanned files: ${files.length}`);
  console.log(`Matched files: ${results.length}`);

  if (results.length === 0) {
    console.log("No direct Product OS table references found.");
    return;
  }

  for (const item of results) {
    console.log(`\n- ${item.file}`);
    item.hits.forEach((hit) => {
      console.log(`  [${hit.table}] L${hit.line}: ${hit.snippet}`);
    });
  }
}

main();
