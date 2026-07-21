/** Read-only Product OS V2 repository. Consumers must not query pos2_* directly. */

const VISIBLE_STATUSES = ["ACTIVE", "FROZEN"];

function createProductReadRepository(prisma) {
  if (!prisma) throw new Error("Prisma client is required");

  const productInclude = {
    parent: { select: { productCode: true } },
    versions: { where: { status: { in: VISIBLE_STATUSES } }, orderBy: { createdAt: "desc" }, take: 1 },
    prices: {
      where: { status: { in: VISIBLE_STATUSES }, customerVisible: true },
      include: { priceBook: true },
      orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }]
    },
    contentPlacements: {
      where: { status: { in: VISIBLE_STATUSES } },
      include: { contentEntry: true },
      orderBy: [{ side: "asc" }, { sortOrder: "asc" }]
    },
    experiences: {
      where: { status: { in: VISIBLE_STATUSES } },
      include: { presentationMappings: { where: { status: { in: VISIBLE_STATUSES } } } },
      orderBy: { sequence: "asc" }
    },
    capabilityInclusions: {
      where: { status: { in: VISIBLE_STATUSES } },
      include: { capability: true }
    },
    relationshipsFrom: {
      where: { status: { in: VISIBLE_STATUSES } },
      include: { toProduct: { select: { productCode: true, canonicalName: true, productKind: true } } },
      orderBy: { priority: "asc" }
    },
    installationAssumptions: {
      where: { status: { in: VISIBLE_STATUSES } },
      orderBy: { sequence: "asc" }
    },
    imageLinks: {
      include: { asset: true, crop: true },
      orderBy: { sequence: "asc" }
    },
    themes: { where: { status: { in: VISIBLE_STATUSES } }, include: { tokens: true } },
    layoutConfigs: { where: { status: { in: VISIBLE_STATUSES } }, include: { template: true } },
    includedBenefits: {
      where: { status: { in: VISIBLE_STATUSES } },
      include: {
        unlockRelationship: {
          include: {
            requirementGroups: { include: { requirements: { include: { requiredProduct: true } } } }
          }
        }
      }
    },
    featuredAsParent: {
      where: { status: { in: VISIBLE_STATUSES }, channel: "A4" },
      include: { addonProduct: { select: { productCode: true } } },
      orderBy: { sortOrder: "asc" }
    }
  };

  async function findProduct(productCode) {
    return prisma.pos2Product.findFirst({
      where: { productCode: String(productCode).toUpperCase(), status: { in: VISIBLE_STATUSES } },
      include: productInclude
    });
  }

  async function findPermittedAddons(parentProductId) {
    return prisma.pos2AddonParentEligibility.findMany({
      where: { parentProductId, status: { in: VISIBLE_STATUSES } },
      include: {
        addonProduct: {
          include: {
            prices: { where: { status: { in: VISIBLE_STATUSES }, customerVisible: true }, include: { priceBook: true } },
            contentPlacements: { include: { contentEntry: true } },
            addonProfile: { include: { extendsCapability: true, expandsSku: true, equipmentBases: { include: { sku: true }, orderBy: { sequence: "asc" } } } }
          }
        }
      }
    });
  }

  async function listProducts() {
    return prisma.pos2Product.findMany({
      where: { status: { in: VISIBLE_STATUSES }, productKind: { not: "ADDON" } },
      select: { productCode: true, canonicalName: true, productKind: true, commercialRole: true, requiresFoundation: true },
      orderBy: { productCode: "asc" }
    });
  }

  async function findAllProductsWithAddons() {
    const products = await prisma.pos2Product.findMany({
      where: { status: { in: VISIBLE_STATUSES }, productKind: { not: "ADDON" } },
      include: productInclude,
      orderBy: { productCode: "asc" }
    });
    const addonRows = products.length ? await prisma.pos2AddonParentEligibility.findMany({
      where: { parentProductId: { in: products.map((product) => product.id) }, status: { in: VISIBLE_STATUSES } },
      include: {
        addonProduct: {
          include: {
            prices: { where: { status: { in: VISIBLE_STATUSES }, customerVisible: true }, include: { priceBook: true } },
            contentPlacements: { include: { contentEntry: true } },
            addonProfile: { include: { extendsCapability: true, expandsSku: true, equipmentBases: { include: { sku: true }, orderBy: { sequence: "asc" } } } }
          }
        }
      }
    }) : [];
    const addonsByParent = new Map();
    for (const row of addonRows) {
      const current = addonsByParent.get(row.parentProductId) || [];
      current.push(row);
      addonsByParent.set(row.parentProductId, current);
    }
    return { products, addonsByParent };
  }

  return { findProduct, findPermittedAddons, listProducts, findAllProductsWithAddons };
}

module.exports = { createProductReadRepository, VISIBLE_STATUSES };
