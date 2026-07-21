#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { prisma } = require("../src/prisma-client");

function normalizeKey(key) {
  return String(key || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function normalizeRow(row) {
  const output = {};
  for (const [k, v] of Object.entries(row)) {
    output[normalizeKey(k)] = v;
  }
  return output;
}

function pick(row, keys, fallback = null) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }
  return fallback;
}

function asString(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value).trim();
}

function asNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (Number.isNaN(n)) {
    throw new Error(`Invalid number value: ${value}`);
  }
  return n;
}

function asBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return null;
  const val = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(val)) return true;
  if (["0", "false", "no", "n"].includes(val)) return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function asJson(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "object") return value;
  return JSON.parse(String(value));
}

function asProductType(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (normalized === "EXPERIENCE_PACK") return "EXPERIENCE_PACK";
  if (normalized === "COLLECTION") return "COLLECTION";
  if (normalized === "INFRASTRUCTURE") return "INFRASTRUCTURE";
  throw new Error(`Invalid product type: ${value}`);
}

function readSheetRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  return rows.map(normalizeRow);
}

function makeCodeMaps(products, skus, labours) {
  const productByCode = new Map(products.map((p) => [p.code, p.id]));
  const skuByCode = new Map(skus.map((s) => [s.sku, s.id]));
  const labourByName = new Map(labours.map((l) => [l.labourItem, l.id]));
  return { productByCode, skuByCode, labourByName };
}

async function importWorkbook(filePath, { dryRun = false } = {}) {
  const workbook = XLSX.readFile(filePath);
  const counters = {};

  const run = async (tx) => {
    const settingsRows = readSheetRows(workbook, "settings");
    for (const row of settingsRows) {
      const settingKey = asString(pick(row, ["setting_key", "key"]));
      if (!settingKey) continue;

      await tx.setting.upsert({
        where: { settingKey },
        update: {
          numericValue: asNumber(pick(row, ["numeric_value"])),
          textValue: asString(pick(row, ["text_value"])),
          booleanValue: asBoolean(pick(row, ["boolean_value"])),
          notes: asString(pick(row, ["notes"]))
        },
        create: {
          settingKey,
          numericValue: asNumber(pick(row, ["numeric_value"])),
          textValue: asString(pick(row, ["text_value"])),
          booleanValue: asBoolean(pick(row, ["boolean_value"])),
          notes: asString(pick(row, ["notes"]))
        }
      });
      counters.settings = (counters.settings || 0) + 1;
    }

    const productRows = readSheetRows(workbook, "product_catalog");
    for (const row of productRows) {
      const code = asString(pick(row, ["code"]));
      if (!code) continue;

      await tx.productCatalog.upsert({
        where: { code },
        update: {
          type: asProductType(pick(row, ["type"])),
          name: asString(pick(row, ["name"])),
          version: asString(pick(row, ["version"])) || "1.0",
          status: asString(pick(row, ["status"])) || "DRAFT",
          coreValue: asString(pick(row, ["core_value"])),
          primaryEmotion: asString(pick(row, ["primary_emotion"])),
          coverage: asString(pick(row, ["coverage"])),
          hero: asString(pick(row, ["hero"])),
          subtitle: asString(pick(row, ["subtitle"])),
          story: asString(pick(row, ["story"])),
          finalInstalledPrice: asNumber(pick(row, ["final_installed_price"])) || 0,
          requiresFoundation:
            asBoolean(pick(row, ["requires_foundation"])) ?? true,
          notes: asString(pick(row, ["notes"]))
        },
        create: {
          code,
          type: asProductType(pick(row, ["type"])),
          name: asString(pick(row, ["name"])),
          version: asString(pick(row, ["version"])) || "1.0",
          status: asString(pick(row, ["status"])) || "DRAFT",
          coreValue: asString(pick(row, ["core_value"])),
          primaryEmotion: asString(pick(row, ["primary_emotion"])),
          coverage: asString(pick(row, ["coverage"])),
          hero: asString(pick(row, ["hero"])),
          subtitle: asString(pick(row, ["subtitle"])),
          story: asString(pick(row, ["story"])),
          finalInstalledPrice: asNumber(pick(row, ["final_installed_price"])) || 0,
          requiresFoundation:
            asBoolean(pick(row, ["requires_foundation"])) ?? true,
          notes: asString(pick(row, ["notes"]))
        }
      });
      counters.product_catalog = (counters.product_catalog || 0) + 1;
    }

    const skuRows = readSheetRows(workbook, "sku_library");
    for (const row of skuRows) {
      const sku = asString(pick(row, ["sku"]));
      if (!sku) continue;
      await tx.skuLibrary.upsert({
        where: { sku },
        update: {
          productName: asString(pick(row, ["product_name"])) || sku,
          category: asString(pick(row, ["category"])),
          brand: asString(pick(row, ["brand"])),
          supplier: asString(pick(row, ["supplier"])),
          unitCostExGst: asNumber(pick(row, ["unit_cost_ex_gst"])) || 0,
          status: asString(pick(row, ["status"])) || "ACTIVE",
          notes: asString(pick(row, ["notes"]))
        },
        create: {
          sku,
          productName: asString(pick(row, ["product_name"])) || sku,
          category: asString(pick(row, ["category"])),
          brand: asString(pick(row, ["brand"])),
          supplier: asString(pick(row, ["supplier"])),
          unitCostExGst: asNumber(pick(row, ["unit_cost_ex_gst"])) || 0,
          status: asString(pick(row, ["status"])) || "ACTIVE",
          notes: asString(pick(row, ["notes"]))
        }
      });
      counters.sku_library = (counters.sku_library || 0) + 1;
    }

    const labourRows = readSheetRows(workbook, "labour_library");
    for (const row of labourRows) {
      const labourItem = asString(pick(row, ["labour_item"]));
      if (!labourItem) continue;
      await tx.labourLibrary.upsert({
        where: { labourItem },
        update: {
          hours: asNumber(pick(row, ["hours"])) || 0,
          category: asString(pick(row, ["category"])),
          notes: asString(pick(row, ["notes"]))
        },
        create: {
          labourItem,
          hours: asNumber(pick(row, ["hours"])) || 0,
          category: asString(pick(row, ["category"])),
          notes: asString(pick(row, ["notes"]))
        }
      });
      counters.labour_library = (counters.labour_library || 0) + 1;
    }

    const products = await tx.productCatalog.findMany({
      select: { id: true, code: true }
    });
    const skus = await tx.skuLibrary.findMany({
      select: { id: true, sku: true }
    });
    const labours = await tx.labourLibrary.findMany({
      select: { id: true, labourItem: true }
    });
    const maps = makeCodeMaps(products, skus, labours);

    const productIdFromRow = (row) => {
      const productId = asString(pick(row, ["product_id"]));
      if (productId) return productId;
      const productCode = asString(pick(row, ["product_code", "code"]));
      if (productCode && maps.productByCode.has(productCode)) {
        return maps.productByCode.get(productCode);
      }
      throw new Error(`Missing product reference in row: ${JSON.stringify(row)}`);
    };

    const importRows = async (sheetName, handler) => {
      const rows = readSheetRows(workbook, sheetName);
      for (const row of rows) {
        await handler(row);
        counters[sheetName] = (counters[sheetName] || 0) + 1;
      }
    };

    await importRows("product_bom", async (row) => {
      const productId = productIdFromRow(row);
      let skuId = asString(pick(row, ["sku_id"]));
      if (!skuId) {
        const skuCode = asString(pick(row, ["sku"]));
        skuId = skuCode ? maps.skuByCode.get(skuCode) : null;
      }
      if (!skuId) throw new Error(`Missing sku reference: ${JSON.stringify(row)}`);

      await tx.productBom.upsert({
        where: { productId_skuId: { productId, skuId } },
        update: {
          qty: asNumber(pick(row, ["qty"])) || 1,
          includedType: asString(pick(row, ["included_type"])) || "STANDARD",
          notes: asString(pick(row, ["notes"]))
        },
        create: {
          productId,
          skuId,
          qty: asNumber(pick(row, ["qty"])) || 1,
          includedType: asString(pick(row, ["included_type"])) || "STANDARD",
          notes: asString(pick(row, ["notes"]))
        }
      });
    });

    await importRows("product_labour", async (row) => {
      const productId = productIdFromRow(row);
      let labourItemId = asString(pick(row, ["labour_item_id"]));
      if (!labourItemId) {
        const labourItem = asString(pick(row, ["labour_item"]));
        labourItemId = labourItem ? maps.labourByName.get(labourItem) : null;
      }
      if (!labourItemId) {
        throw new Error(`Missing labour reference: ${JSON.stringify(row)}`);
      }
      await tx.productLabour.upsert({
        where: { productId_labourItemId: { productId, labourItemId } },
        update: {
          qty: asNumber(pick(row, ["qty"])) || 1,
          notes: asString(pick(row, ["notes"]))
        },
        create: {
          productId,
          labourItemId,
          qty: asNumber(pick(row, ["qty"])) || 1,
          notes: asString(pick(row, ["notes"]))
        }
      });
    });

    await importRows("product_experiences", async (row) => {
      const productId = productIdFromRow(row);
      const sequence = asNumber(pick(row, ["sequence"])) || 1;
      await tx.productExperience.upsert({
        where: { productId_sequence: { productId, sequence } },
        update: {
          title: asString(pick(row, ["title"])) || "Untitled",
          description: asString(pick(row, ["description"])),
          status: asString(pick(row, ["status"])) || "ACTIVE"
        },
        create: {
          productId,
          sequence,
          title: asString(pick(row, ["title"])) || "Untitled",
          description: asString(pick(row, ["description"])),
          status: asString(pick(row, ["status"])) || "ACTIVE"
        }
      });
    });

    await importRows("product_capabilities", async (row) => {
      const productId = productIdFromRow(row);
      await tx.productCapability.create({
        data: {
          productId,
          capability: asString(pick(row, ["capability"])) || "Capability",
          includedQty: asNumber(pick(row, ["included_qty"])),
          customerLayer: asString(pick(row, ["customer_layer"])),
          notes: asString(pick(row, ["notes"]))
        }
      });
    });

    await importRows("product_rules", async (row) => {
      const productId = productIdFromRow(row);
      const ruleKey = asString(pick(row, ["rule_key"]));
      if (!ruleKey) return;
      await tx.productRule.upsert({
        where: { productId_ruleKey: { productId, ruleKey } },
        update: {
          ruleValue: asString(pick(row, ["rule_value"])) || "",
          notes: asString(pick(row, ["notes"]))
        },
        create: {
          productId,
          ruleKey,
          ruleValue: asString(pick(row, ["rule_value"])) || "",
          notes: asString(pick(row, ["notes"]))
        }
      });
    });

    await importRows("product_content", async (row) => {
      const productId = productIdFromRow(row);
      const contentType = asString(pick(row, ["content_type"])) || "general";
      const contentKey = asString(pick(row, ["content_key"])) || "default";
      const sequence = asNumber(pick(row, ["sequence"])) || 1;
      await tx.productContent.upsert({
        where: {
          productId_contentType_contentKey_sequence: {
            productId,
            contentType,
            contentKey,
            sequence
          }
        },
        update: {
          title: asString(pick(row, ["title"])),
          body: asString(pick(row, ["body"])),
          status: asString(pick(row, ["status"])) || "ACTIVE",
          notes: asString(pick(row, ["notes"]))
        },
        create: {
          productId,
          contentType,
          contentKey,
          sequence,
          title: asString(pick(row, ["title"])),
          body: asString(pick(row, ["body"])),
          status: asString(pick(row, ["status"])) || "ACTIVE",
          notes: asString(pick(row, ["notes"]))
        }
      });
    });

    await importRows("product_icons", async (row) => {
      const productId = productIdFromRow(row);
      const iconKey = asString(pick(row, ["icon_key"])) || "default_icon";
      const sequence = asNumber(pick(row, ["sequence"])) || 1;
      await tx.productIcon.upsert({
        where: { productId_iconKey_sequence: { productId, iconKey, sequence } },
        update: {
          title: asString(pick(row, ["title"])),
          assetUrl: asString(pick(row, ["asset_url"])),
          status: asString(pick(row, ["status"])) || "ACTIVE",
          notes: asString(pick(row, ["notes"]))
        },
        create: {
          productId,
          iconKey,
          sequence,
          title: asString(pick(row, ["title"])),
          assetUrl: asString(pick(row, ["asset_url"])),
          status: asString(pick(row, ["status"])) || "ACTIVE",
          notes: asString(pick(row, ["notes"]))
        }
      });
    });

    await importRows("product_images", async (row) => {
      const productId = productIdFromRow(row);
      const imageType = asString(pick(row, ["image_type"])) || "default";
      const sequence = asNumber(pick(row, ["sequence"])) || 1;
      await tx.productImage.upsert({
        where: {
          productId_imageType_sequence: {
            productId,
            imageType,
            sequence
          }
        },
        update: {
          imageUrl: asString(pick(row, ["image_url"])) || "",
          altText: asString(pick(row, ["alt_text"])),
          status: asString(pick(row, ["status"])) || "ACTIVE",
          notes: asString(pick(row, ["notes"]))
        },
        create: {
          productId,
          imageType,
          sequence,
          imageUrl: asString(pick(row, ["image_url"])) || "",
          altText: asString(pick(row, ["alt_text"])),
          status: asString(pick(row, ["status"])) || "ACTIVE",
          notes: asString(pick(row, ["notes"]))
        }
      });
    });

    await importRows("product_theme", async (row) => {
      const productId = productIdFromRow(row);
      const themeKey = asString(pick(row, ["theme_key"])) || "default_theme";
      await tx.productTheme.upsert({
        where: { productId_themeKey: { productId, themeKey } },
        update: {
          primaryColor: asString(pick(row, ["primary_color"])),
          secondaryColor: asString(pick(row, ["secondary_color"])),
          typographyScheme: asString(pick(row, ["typography_scheme"])),
          status: asString(pick(row, ["status"])) || "ACTIVE",
          notes: asString(pick(row, ["notes"]))
        },
        create: {
          productId,
          themeKey,
          primaryColor: asString(pick(row, ["primary_color"])),
          secondaryColor: asString(pick(row, ["secondary_color"])),
          typographyScheme: asString(pick(row, ["typography_scheme"])),
          status: asString(pick(row, ["status"])) || "ACTIVE",
          notes: asString(pick(row, ["notes"]))
        }
      });
    });

    await importRows("product_layout", async (row) => {
      const productId = productIdFromRow(row);
      const layoutKey = asString(pick(row, ["layout_key"])) || "default_layout";
      await tx.productLayout.upsert({
        where: { productId_layoutKey: { productId, layoutKey } },
        update: {
          renderTarget: asString(pick(row, ["render_target"])),
          definition: asJson(pick(row, ["definition"])),
          status: asString(pick(row, ["status"])) || "ACTIVE",
          notes: asString(pick(row, ["notes"]))
        },
        create: {
          productId,
          layoutKey,
          renderTarget: asString(pick(row, ["render_target"])),
          definition: asJson(pick(row, ["definition"])),
          status: asString(pick(row, ["status"])) || "ACTIVE",
          notes: asString(pick(row, ["notes"]))
        }
      });
    });

    await importRows("product_automation", async (row) => {
      const productId = productIdFromRow(row);
      const automationKey =
        asString(pick(row, ["automation_key"])) || "default_automation";
      const sequence = asNumber(pick(row, ["sequence"])) || 1;
      await tx.productAutomation.upsert({
        where: {
          productId_automationKey_sequence: {
            productId,
            automationKey,
            sequence
          }
        },
        update: {
          title: asString(pick(row, ["title"])) || "Untitled automation",
          description: asString(pick(row, ["description"])),
          triggerType: asString(pick(row, ["trigger_type"])),
          status: asString(pick(row, ["status"])) || "ACTIVE",
          notes: asString(pick(row, ["notes"]))
        },
        create: {
          productId,
          automationKey,
          sequence,
          title: asString(pick(row, ["title"])) || "Untitled automation",
          description: asString(pick(row, ["description"])),
          triggerType: asString(pick(row, ["trigger_type"])),
          status: asString(pick(row, ["status"])) || "ACTIVE",
          notes: asString(pick(row, ["notes"]))
        }
      });
    });

    await importRows("change_log", async (row) => {
      let productId = asString(pick(row, ["product_id"]));
      if (!productId) {
        const productCode = asString(pick(row, ["product_code"]));
        if (productCode && maps.productByCode.has(productCode)) {
          productId = maps.productByCode.get(productCode);
        }
      }
      await tx.changeLog.create({
        data: {
          productId,
          changedBy: asString(pick(row, ["changed_by"])),
          changeType: asString(pick(row, ["change_type"])) || "IMPORT",
          changeSummary: asString(pick(row, ["change_summary"])),
          previousVersion: asString(pick(row, ["previous_version"])),
          newVersion: asString(pick(row, ["new_version"])),
          metadata: asJson(pick(row, ["metadata"]))
        }
      });
    });
  };

  if (dryRun) {
    await prisma.$transaction(async (tx) => {
      await run(tx);
      throw new Error("__DRY_RUN_ROLLBACK__");
    }).catch((e) => {
      if (e.message !== "__DRY_RUN_ROLLBACK__") throw e;
    });
  } else {
    await prisma.$transaction(async (tx) => {
      await run(tx);
    });
  }

  return counters;
}

function parseArg(name) {
  const args = process.argv.slice(2);
  const index = args.findIndex((a) => a === name || a.startsWith(`${name}=`));
  if (index === -1) return null;
  const token = args[index];
  if (token.includes("=")) return token.split("=")[1];
  return args[index + 1] || null;
}

async function main() {
  const fileArg = parseArg("--file");
  const dryRun = process.argv.includes("--dry-run");
  const filePath = fileArg ? path.resolve(fileArg) : null;

  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(
      "Usage: pnpm --filter @bht/product-os import:excel -- --file <excel-path> [--dry-run]"
    );
  }

  const counters = await importWorkbook(filePath, { dryRun });
  console.log(
    `[Product OS Import] ${dryRun ? "Dry-run completed" : "Completed"}`
  );
  console.table(counters);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("[Product OS Import] failed:", error.message);
    await prisma.$disconnect();
    process.exit(1);
  });
