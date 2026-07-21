#!/usr/bin/env node
/**
 * Static scan of Product OS migration SQL for destructive V1 statements.
 * No database connection.
 */
const fs = require("fs");
const path = require("path");

const migrationDir = path.join(__dirname, "../prisma/migrations");
const forbidden = [
  /DROP\s+TABLE\s+"(settings|product_catalog|sku_library|labour_library|product_bom|product_labour|product_experiences|product_capabilities|product_rules|product_content|product_icons|product_images|product_theme|product_layout|product_automation|change_log)"/i,
  /ALTER\s+TABLE\s+"(settings|product_catalog|sku_library|labour_library|product_bom|product_labour|product_experiences|product_capabilities|product_rules|product_content|product_icons|product_images|product_theme|product_layout|product_automation|change_log)"/i,
  /DROP\s+TYPE\s+"(ProductType|RecordStatus|IncludedType)"/i,
  /DROP\s+VIEW\s+"product_pricing_summary"/i
];

let failures = 0;
for (const entry of fs.readdirSync(migrationDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const sqlPath = path.join(migrationDir, entry.name, "migration.sql");
  if (!fs.existsSync(sqlPath)) continue;
  const sql = fs.readFileSync(sqlPath, "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(sql)) {
      console.error(`FAIL ${entry.name}: matched ${pattern}`);
      failures += 1;
    }
  }
  if (entry.name.includes("add_product_os_v2") && !/CREATE TABLE "pos2_products"/.test(sql)) {
    console.error(`FAIL ${entry.name}: missing pos2_products create`);
    failures += 1;
  }
}

if (failures > 0) {
  process.exitCode = 1;
  console.error(`Migration safety scan failed (${failures}).`);
} else {
  console.log("Migration safety scan passed (no destructive V1 statements detected).");
}
