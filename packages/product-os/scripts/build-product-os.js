#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const {
  GENERATED_DIR,
  ensureDir,
  loadDefinitions
} = require("./lib/product-definition-utils");
const { generateValidationReport } = require("./validate-product-definitions");
const { generateCompletionReport } = require("./generate-definition-completion-report");
const { generateQuestionsReport } = require("./generate-questions-report");

function toStatus(status) {
  return status || "DRAFT";
}

function toIncludedType(type) {
  return type || "STANDARD";
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toStringOrNull(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s.length === 0 ? null : s;
}

function toProductType(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (normalized === "EXPERIENCE_PACK") return "EXPERIENCE_PACK";
  if (normalized === "COLLECTION") return "COLLECTION";
  if (normalized === "INFRASTRUCTURE") return "INFRASTRUCTURE";
  throw new Error(`Unsupported product type: ${value}`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes("--dry-run"),
    offline: args.includes("--offline")
  };
}

function buildSeedSnapshot(definitions) {
  return definitions.map(({ fileName, data }) => ({
    fileName,
    product: data.product,
    hero: data.hero,
    subtitle: data.subtitle,
    story: data.story,
    experiences: data.experiences || [],
    capabilities: data.capabilities || [],
    bom: data.bom || [],
    labour: data.labour || [],
    pricing: data.pricing || {},
    content: data.content || [],
    automation: data.automation || [],
    icons: data.icons || [],
    theme: data.theme || [],
    layout: data.layout || [],
    images: data.images || [],
    rules: data.rules || [],
    notes: data.notes || null
  }));
}

async function runBuild(definitions, { dryRun, prismaClient }) {
  const counters = {
    product_catalog: 0,
    sku_library: 0,
    labour_library: 0,
    product_bom: 0,
    product_labour: 0,
    product_experiences: 0,
    product_capabilities: 0,
    product_rules: 0,
    product_content: 0,
    product_icons: 0,
    product_images: 0,
    product_theme: 0,
    product_layout: 0,
    product_automation: 0,
    change_log: 0
  };

  const run = async (tx) => {
    for (const def of definitions) {
      const data = def.data;
      const productCode = data.product.code;

      const product = await tx.productCatalog.upsert({
        where: { code: productCode },
        update: {
          type: toProductType(data.product.type),
          name: data.product.name,
          version: data.product.version || "1.0",
          status: toStatus(data.product.status),
          coreValue: data.product.core_value || null,
          primaryEmotion: data.product.primary_emotion || null,
          coverage: data.product.coverage || null,
          hero: data.hero || null,
          subtitle: data.subtitle || null,
          story: data.story || null,
          finalInstalledPrice: toNumber(data.pricing.final_installed_price, 0),
          requiresFoundation:
            data.product.requires_foundation !== undefined
              ? Boolean(data.product.requires_foundation)
              : true,
          notes: data.notes || null
        },
        create: {
          code: productCode,
          type: toProductType(data.product.type),
          name: data.product.name,
          version: data.product.version || "1.0",
          status: toStatus(data.product.status),
          coreValue: data.product.core_value || null,
          primaryEmotion: data.product.primary_emotion || null,
          coverage: data.product.coverage || null,
          hero: data.hero || null,
          subtitle: data.subtitle || null,
          story: data.story || null,
          finalInstalledPrice: toNumber(data.pricing.final_installed_price, 0),
          requiresFoundation:
            data.product.requires_foundation !== undefined
              ? Boolean(data.product.requires_foundation)
              : true,
          notes: data.notes || null
        }
      });
      counters.product_catalog += 1;

      for (const item of data.bom || []) {
        const skuCode = String(item.sku || "").trim();
        if (!skuCode) continue;
        const sku = await tx.skuLibrary.upsert({
          where: { sku: skuCode },
          update: {
            productName: item.product_name || skuCode,
            category: item.category || "General",
            brand: item.brand || null,
            supplier: item.supplier || null,
            unitCostExGst: toNumber(item.unit_cost_ex_gst, 0),
            status: toStatus(item.status || "ACTIVE"),
            notes: item.notes || null
          },
          create: {
            sku: skuCode,
            productName: item.product_name || skuCode,
            category: item.category || "General",
            brand: item.brand || null,
            supplier: item.supplier || null,
            unitCostExGst: toNumber(item.unit_cost_ex_gst, 0),
            status: toStatus(item.status || "ACTIVE"),
            notes: item.notes || null
          }
        });
        counters.sku_library += 1;

        await tx.productBom.upsert({
          where: { productId_skuId: { productId: product.id, skuId: sku.id } },
          update: {
            qty: toNumber(item.qty, 1),
            includedType: toIncludedType(item.included_type),
            notes: item.notes || null
          },
          create: {
            productId: product.id,
            skuId: sku.id,
            qty: toNumber(item.qty, 1),
            includedType: toIncludedType(item.included_type),
            notes: item.notes || null
          }
        });
        counters.product_bom += 1;
      }

      for (const item of data.labour || []) {
        const labourItemName = String(item.labour_item || "").trim();
        if (!labourItemName) continue;
        const labour = await tx.labourLibrary.upsert({
          where: { labourItem: labourItemName },
          update: {
            hours: toNumber(item.hours, 0),
            category: item.category || null,
            notes: item.notes || null
          },
          create: {
            labourItem: labourItemName,
            hours: toNumber(item.hours, 0),
            category: item.category || null,
            notes: item.notes || null
          }
        });
        counters.labour_library += 1;

        await tx.productLabour.upsert({
          where: {
            productId_labourItemId: {
              productId: product.id,
              labourItemId: labour.id
            }
          },
          update: {
            qty: toNumber(item.qty, 1),
            notes: item.notes || null
          },
          create: {
            productId: product.id,
            labourItemId: labour.id,
            qty: toNumber(item.qty, 1),
            notes: item.notes || null
          }
        });
        counters.product_labour += 1;
      }

      for (const item of data.experiences || []) {
        await tx.productExperience.upsert({
          where: {
            productId_sequence: {
              productId: product.id,
              sequence: toNumber(item.sequence, 1)
            }
          },
          update: {
            title: item.title || "Untitled Experience",
            description: item.description || null,
            status: toStatus(item.status || "ACTIVE")
          },
          create: {
            productId: product.id,
            sequence: toNumber(item.sequence, 1),
            title: item.title || "Untitled Experience",
            description: item.description || null,
            status: toStatus(item.status || "ACTIVE")
          }
        });
        counters.product_experiences += 1;
      }

      for (const item of data.capabilities || []) {
        await tx.productCapability.create({
          data: {
            productId: product.id,
            capability: item.capability || "Capability",
            includedQty:
              item.included_qty === undefined
                ? null
                : toNumber(item.included_qty, 0),
            customerLayer: item.customer_layer || null,
            notes: item.notes || null
          }
        });
        counters.product_capabilities += 1;
      }

      for (const item of data.rules || []) {
        if (!item.rule_key) continue;
        await tx.productRule.upsert({
          where: {
            productId_ruleKey: {
              productId: product.id,
              ruleKey: item.rule_key
            }
          },
          update: {
            ruleValue: item.rule_value || "",
            notes: item.notes || null
          },
          create: {
            productId: product.id,
            ruleKey: item.rule_key,
            ruleValue: item.rule_value || "",
            notes: item.notes || null
          }
        });
        counters.product_rules += 1;
      }

      for (const item of data.content || []) {
        const contentType = item.content_type || "overview";
        const contentKey = item.content_key || "default";
        const sequence = toNumber(item.sequence, 1);
        await tx.productContent.upsert({
          where: {
            productId_contentType_contentKey_sequence: {
              productId: product.id,
              contentType,
              contentKey,
              sequence
            }
          },
          update: {
            title: toStringOrNull(item.title),
            body: toStringOrNull(item.body),
            status: toStatus(item.status || "ACTIVE"),
            notes: toStringOrNull(item.notes)
          },
          create: {
            productId: product.id,
            contentType,
            contentKey,
            sequence,
            title: toStringOrNull(item.title),
            body: toStringOrNull(item.body),
            status: toStatus(item.status || "ACTIVE"),
            notes: toStringOrNull(item.notes)
          }
        });
        counters.product_content += 1;
      }

      for (const item of data.automation || []) {
        const sequence = toNumber(item.sequence, 1);
        const automationKey = item.automation_key || "default_automation";
        await tx.productAutomation.upsert({
          where: {
            productId_automationKey_sequence: {
              productId: product.id,
              automationKey,
              sequence
            }
          },
          update: {
            title: item.title || "Untitled Automation",
            description: toStringOrNull(item.description),
            triggerType: toStringOrNull(item.trigger_type),
            status: toStatus(item.status || "ACTIVE"),
            notes: toStringOrNull(item.notes)
          },
          create: {
            productId: product.id,
            automationKey,
            sequence,
            title: item.title || "Untitled Automation",
            description: toStringOrNull(item.description),
            triggerType: toStringOrNull(item.trigger_type),
            status: toStatus(item.status || "ACTIVE"),
            notes: toStringOrNull(item.notes)
          }
        });
        counters.product_automation += 1;
      }

      for (const item of data.icons || []) {
        const iconKey = item.icon_key || "default_icon";
        const sequence = toNumber(item.sequence, 1);
        await tx.productIcon.upsert({
          where: {
            productId_iconKey_sequence: {
              productId: product.id,
              iconKey,
              sequence
            }
          },
          update: {
            title: toStringOrNull(item.title),
            assetUrl: toStringOrNull(item.asset_url),
            status: toStatus(item.status || "ACTIVE"),
            notes: toStringOrNull(item.notes)
          },
          create: {
            productId: product.id,
            iconKey,
            sequence,
            title: toStringOrNull(item.title),
            assetUrl: toStringOrNull(item.asset_url),
            status: toStatus(item.status || "ACTIVE"),
            notes: toStringOrNull(item.notes)
          }
        });
        counters.product_icons += 1;
      }

      for (const item of data.theme || []) {
        const themeKey = item.theme_key || "default_theme";
        await tx.productTheme.upsert({
          where: { productId_themeKey: { productId: product.id, themeKey } },
          update: {
            primaryColor: toStringOrNull(item.primary_color),
            secondaryColor: toStringOrNull(item.secondary_color),
            typographyScheme: toStringOrNull(item.typography_scheme),
            status: toStatus(item.status || "ACTIVE"),
            notes: toStringOrNull(item.notes)
          },
          create: {
            productId: product.id,
            themeKey,
            primaryColor: toStringOrNull(item.primary_color),
            secondaryColor: toStringOrNull(item.secondary_color),
            typographyScheme: toStringOrNull(item.typography_scheme),
            status: toStatus(item.status || "ACTIVE"),
            notes: toStringOrNull(item.notes)
          }
        });
        counters.product_theme += 1;
      }

      for (const item of data.layout || []) {
        const layoutKey = item.layout_key || "default_layout";
        await tx.productLayout.upsert({
          where: { productId_layoutKey: { productId: product.id, layoutKey } },
          update: {
            renderTarget: toStringOrNull(item.render_target),
            definition: item.definition || null,
            status: toStatus(item.status || "ACTIVE"),
            notes: toStringOrNull(item.notes)
          },
          create: {
            productId: product.id,
            layoutKey,
            renderTarget: toStringOrNull(item.render_target),
            definition: item.definition || null,
            status: toStatus(item.status || "ACTIVE"),
            notes: toStringOrNull(item.notes)
          }
        });
        counters.product_layout += 1;
      }

      for (const item of data.images || []) {
        const imageType = item.image_type || "hero";
        const sequence = toNumber(item.sequence, 1);
        await tx.productImage.upsert({
          where: {
            productId_imageType_sequence: {
              productId: product.id,
              imageType,
              sequence
            }
          },
          update: {
            imageUrl: item.image_url || "",
            altText: toStringOrNull(item.alt_text),
            status: toStatus(item.status || "ACTIVE"),
            notes: toStringOrNull(item.notes)
          },
          create: {
            productId: product.id,
            imageType,
            sequence,
            imageUrl: item.image_url || "",
            altText: toStringOrNull(item.alt_text),
            status: toStatus(item.status || "ACTIVE"),
            notes: toStringOrNull(item.notes)
          }
        });
        counters.product_images += 1;
      }

      await tx.changeLog.create({
        data: {
          productId: product.id,
          changedBy: "build-product-os",
          changeType: "DEFINITION_SYNC",
          changeSummary: `Synced from definition file ${def.fileName}`,
          previousVersion: null,
          newVersion: data.product.version || "1.0",
          metadata: {
            source: "definitions-json",
            fileName: def.fileName
          }
        }
      });
      counters.change_log += 1;
    }
  };

  if (dryRun) {
    await prismaClient.$transaction(async (tx) => {
      await run(tx);
      throw new Error("__DRY_RUN_ROLLBACK__");
    }).catch((e) => {
      if (e.message !== "__DRY_RUN_ROLLBACK__") throw e;
    });
  } else {
    await prismaClient.$transaction(async (tx) => {
      await run(tx);
    });
  }

  return counters;
}

async function main() {
  const { dryRun, offline } = parseArgs();
  const definitions = loadDefinitions();

  if (definitions.length === 0) {
    throw new Error("No product definition JSON found in definitions/.");
  }

  ensureDir(GENERATED_DIR);
  const seedSnapshot = buildSeedSnapshot(definitions);
  const snapshotPath = path.join(GENERATED_DIR, "product-seed-data.json");
  fs.writeFileSync(snapshotPath, JSON.stringify(seedSnapshot, null, 2), "utf8");

  const { report: validationReport, reportPath: validationPath, invalidCount } =
    generateValidationReport();
  const { outputPath: completionPath, products } =
    generateCompletionReport(validationReport);
  const { outputPath: questionsPath, questionCount } = generateQuestionsReport();

  if (invalidCount > 0) {
    throw new Error(
      `Validation failed (${invalidCount} invalid definitions). Resolve before build.`
    );
  }

  if (offline) {
    console.log("Product seed snapshot generated in offline mode");
    console.log(`Definitions: ${definitions.length}`);
    console.log(`Seed snapshot: ${path.relative(process.cwd(), snapshotPath)}`);
    console.log(`Validation report: ${path.relative(process.cwd(), validationPath)}`);
    console.log(`Completion report: ${path.relative(process.cwd(), completionPath)}`);
    console.log(`Questions report: ${path.relative(process.cwd(), questionsPath)}`);
    if (
      questionCount === 0 &&
      products.every((product) => product.completionPercent === 100)
    ) {
      console.log("Product Ready For Release");
    }
    return;
  }

  const { prisma } = require("../src/prisma-client");
  const counters = await runBuild(definitions, { dryRun, prismaClient: prisma });
  console.log("=== Product OS Build Report ===");
  console.log(`Definitions: ${definitions.length}`);
  console.log(`Mode: ${dryRun ? "dry-run" : "apply"}`);
  console.log(`Seed snapshot: ${path.relative(process.cwd(), snapshotPath)}`);
  console.log(`Validation report: ${path.relative(process.cwd(), validationPath)}`);
  console.log(`Completion report: ${path.relative(process.cwd(), completionPath)}`);
  console.log(`Questions report: ${path.relative(process.cwd(), questionsPath)}`);
  console.table(counters);

  if (
    questionCount === 0 &&
    products.every((product) => product.completionPercent === 100)
  ) {
    console.log("Product Ready For Release");
  }

  await prisma.$disconnect();
}

main()
  .catch((error) => {
    console.error("[build-product-os] failed:", error.message);
    process.exit(1);
  });
