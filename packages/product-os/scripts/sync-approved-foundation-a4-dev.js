#!/usr/bin/env node

const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const { buildImportPlanFromApprovedSources } = require("../src/v2/import/build-import-plan");
const { assertProductOsDatabaseTarget, resolveDatabaseUrlForEnv, fingerprintHost } = require("../src/v2/env-guard");

const argv = new Set(process.argv.slice(2));
if (!argv.has("--env=neon_dev")) throw new Error("Only explicit --env=neon_dev is allowed");
const apply = argv.has("--apply-approved-a4-copy");
assertProductOsDatabaseTarget({ envName: "neon_dev", requireUrl: true, requireFingerprint: true });
const url = resolveDatabaseUrlForEnv("neon_dev");
const prisma = new PrismaClient({ datasourceUrl: url });

class DryRunRollback extends Error {
  constructor(counts) { super("DRY_RUN_ROLLBACK"); this.counts = counts; }
}

async function sync(tx) {
  const plan = buildImportPlanFromApprovedSources();
  const targetCodes = ["F-01", "C-02"];
  const rows = plan.contentEntries.filter((entry) => targetCodes.includes(entry.productCode));
  if (!rows.length) throw new Error("Approved A4 content is missing from ImportPlan");
  const products = await tx.pos2Product.findMany({ where: { productCode: { in: targetCodes } } });
  const productsByCode = new Map(products.map((product) => [product.productCode, product]));
  for (const code of targetCodes) if (!productsByCode.has(code)) throw new Error(`${code} is missing from Neon DEV`);

  for (const row of rows) {
    const product = productsByCode.get(row.productCode);
    const versionLabel = row.contentVersion || "foundation-a4-v1";
    const content = await tx.pos2ContentEntry.upsert({
      where: { contentKey_locale_versionLabel: { contentKey: row.contentCode, locale: row.locale || "en-AU", versionLabel } },
      create: { contentKey: row.contentCode, contentKind: row.contentKind, locale: row.locale || "en-AU", title: row.title, body: row.body, languageLayer: row.languageLayer || "CUSTOMER", status: "FROZEN", versionLabel },
      update: { contentKind: row.contentKind, title: row.title, body: row.body, languageLayer: row.languageLayer || "CUSTOMER", status: "FROZEN" }
    });
    await tx.pos2ProductContentPlacement.upsert({
      where: { productId_contentEntryId_channel_surface_side_sortOrder: { productId: product.id, contentEntryId: content.id, channel: "A4", surface: row.a4TemplateMappingKey || row.contentCode, side: row.surface || "NA", sortOrder: row.sequence || 1 } },
      create: { productId: product.id, contentEntryId: content.id, channel: "A4", surface: row.a4TemplateMappingKey || row.contentCode, side: row.surface || "NA", sortOrder: row.sequence || 1, status: "ACTIVE" },
      update: { status: "ACTIVE" }
    });
  }
  const product = productsByCode.get("F-01");
  const featuredCodes = ["AO-026", "AO-027", "AO-030"];
  const featuredProducts = await tx.pos2Product.findMany({ where: { productCode: { in: featuredCodes } } });
  const featuredByCode = new Map(featuredProducts.map((item) => [item.productCode, item]));
  for (let index = 0; index < featuredCodes.length; index += 1) {
    const addon = featuredByCode.get(featuredCodes[index]);
    if (!addon) throw new Error(`Approved Foundation Add-on ${featuredCodes[index]} is missing from Neon DEV`);
    await tx.pos2ProductFeaturedAddon.upsert({
      where: { parentProductId_addonProductId_channel_surface: { parentProductId: product.id, addonProductId: addon.id, channel: "A4", surface: "BACK" } },
      create: { parentProductId: product.id, addonProductId: addon.id, channel: "A4", surface: "BACK", sortOrder: index + 1, status: "ACTIVE" },
      update: { sortOrder: index + 1, status: "ACTIVE" }
    });
  }
  return { products: targetCodes, contentEntries: rows.length, placements: rows.length, featuredAddons: featuredCodes.length, digest: crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex") };
}

(async () => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const counts = await sync(tx);
      if (!apply) throw new DryRunRollback(counts);
      return counts;
    }, { maxWait: 10000, timeout: 120000 });
    console.log(JSON.stringify({ phase: "FOUNDATION_A4_SYNC", mode: "APPLY", target: "neon_dev", fingerprint: fingerprintHost(url), ...result }));
  } catch (error) {
    if (error instanceof DryRunRollback) {
      console.log(JSON.stringify({ phase: "FOUNDATION_A4_SYNC", mode: "DRY_RUN_ROLLBACK", target: "neon_dev", fingerprint: fingerprintHost(url), ...error.counts }));
      return;
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
})().catch((error) => {
  console.error(`Approved A4 DEV sync failed: ${error.code || error.message}`);
  process.exitCode = 1;
});
