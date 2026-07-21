class ProductRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async findByCode(code) {
    return this.prisma.productCatalog.findUnique({
      where: { code },
      include: {
        experiences: { orderBy: { sequence: "asc" } },
        capabilities: true,
        rules: true,
        contentItems: { orderBy: { sequence: "asc" } },
        icons: { orderBy: { sequence: "asc" } },
        images: { orderBy: { sequence: "asc" } },
        themes: true,
        layouts: true,
        automations: { orderBy: { sequence: "asc" } },
        bomItems: {
          include: { sku: true }
        },
        labourItems: {
          include: { labourItem: true }
        }
      }
    });
  }

  async findPricingByCode(code) {
    const rows = await this.prisma.$queryRaw`
      SELECT *
      FROM product_pricing_summary
      WHERE product_code = ${code}
      LIMIT 1
    `;
    return rows[0] || null;
  }

  async findPricingByCodes(codes) {
    if (!Array.isArray(codes) || codes.length === 0) return [];
    return this.prisma.$queryRaw`
      SELECT *
      FROM product_pricing_summary
      WHERE product_code = ANY(${codes})
    `;
  }

  async listProducts(filters = {}) {
    const where = {};
    if (filters.status) where.status = filters.status;
    if (filters.type) where.type = filters.type;
    if (typeof filters.requiresFoundation === "boolean") {
      where.requiresFoundation = filters.requiresFoundation;
    }

    return this.prisma.productCatalog.findMany({
      where,
      orderBy: [{ type: "asc" }, { code: "asc" }]
    });
  }

  async createChangeLog(input) {
    return this.prisma.changeLog.create({ data: input });
  }
}

module.exports = { ProductRepository };
