class ProductService {
  constructor({ productRepository }) {
    this.productRepository = productRepository;
  }

  async getProductCardByCode(code) {
    const product = await this.productRepository.findByCode(code);
    if (!product) return null;

    const pricing = await this.productRepository.findPricingByCode(code);
    return {
      product,
      pricing
    };
  }

  async getPricingSummary(productCode) {
    const pricing = await this.productRepository.findPricingByCode(productCode);
    if (!pricing) return null;

    return {
      productCode: pricing.product_code,
      pricing: {
        materialCost: Number(pricing.material_cost || 0),
        labourCost: Number(pricing.labour_cost || 0),
        directCost: Number(pricing.direct_cost || 0),
        installedPrice: Number(pricing.installed_price || 0),
        grossProfit: Number(pricing.gross_profit || 0),
        grossMargin: Number(pricing.gross_margin || 0)
      }
    };
  }

  async getProductForPrint(productCode) {
    const card = await this.getProductCardByCode(productCode);
    if (!card) return null;

    const { product, pricing } = card;
    return {
      product: {
        id: product.id,
        code: product.code,
        type: product.type,
        name: product.name,
        version: product.version,
        status: product.status,
        subtitle: product.subtitle,
        hero: product.hero,
        story: product.story,
        requiresFoundation: product.requiresFoundation
      },
      pricing: pricing
        ? {
            materialCost: Number(pricing.material_cost || 0),
            labourCost: Number(pricing.labour_cost || 0),
            directCost: Number(pricing.direct_cost || 0),
            installedPrice: Number(pricing.installed_price || 0),
            grossProfit: Number(pricing.gross_profit || 0),
            grossMargin: Number(pricing.gross_margin || 0)
          }
        : null,
      content: product.contentItems.map((item) => ({
        type: item.contentType,
        key: item.contentKey,
        sequence: item.sequence,
        title: item.title,
        body: item.body,
        status: item.status
      })),
      media: {
        icons: product.icons.map((icon) => ({
          key: icon.iconKey,
          title: icon.title,
          assetUrl: icon.assetUrl,
          sequence: icon.sequence
        })),
        images: product.images.map((image) => ({
          type: image.imageType,
          url: image.imageUrl,
          altText: image.altText,
          sequence: image.sequence
        }))
      },
      theme: product.themes.map((theme) => ({
        key: theme.themeKey,
        primaryColor: theme.primaryColor,
        secondaryColor: theme.secondaryColor,
        typographyScheme: theme.typographyScheme
      })),
      layout: product.layouts.map((layout) => ({
        key: layout.layoutKey,
        renderTarget: layout.renderTarget,
        definition: layout.definition
      }))
    };
  }

  async getProductForProposal(productCode) {
    const card = await this.getProductCardByCode(productCode);
    if (!card) return null;

    const { product, pricing } = card;
    return {
      product: {
        id: product.id,
        code: product.code,
        type: product.type,
        name: product.name,
        version: product.version,
        status: product.status,
        coreValue: product.coreValue,
        primaryEmotion: product.primaryEmotion,
        coverage: product.coverage,
        requiresFoundation: product.requiresFoundation
      },
      pricing: pricing
        ? {
            materialCost: Number(pricing.material_cost || 0),
            labourCost: Number(pricing.labour_cost || 0),
            directCost: Number(pricing.direct_cost || 0),
            installedPrice: Number(pricing.installed_price || 0),
            grossProfit: Number(pricing.gross_profit || 0),
            grossMargin: Number(pricing.gross_margin || 0)
          }
        : null,
      billOfMaterials: product.bomItems.map((item) => ({
        qty: Number(item.qty || 0),
        includedType: item.includedType,
        notes: item.notes,
        sku: {
          code: item.sku.sku,
          name: item.sku.productName,
          category: item.sku.category,
          brand: item.sku.brand,
          supplier: item.sku.supplier
        }
      })),
      labour: product.labourItems.map((item) => ({
        qty: Number(item.qty || 0),
        notes: item.notes,
        labourItem: {
          name: item.labourItem.labourItem,
          hours: Number(item.labourItem.hours || 0),
          category: item.labourItem.category
        }
      })),
      capabilities: product.capabilities.map((item) => ({
        capability: item.capability,
        includedQty: item.includedQty === null ? null : Number(item.includedQty),
        customerLayer: item.customerLayer,
        notes: item.notes
      })),
      experiences: product.experiences.map((item) => ({
        sequence: item.sequence,
        title: item.title,
        description: item.description,
        status: item.status
      })),
      rules: product.rules.map((item) => ({
        key: item.ruleKey,
        value: item.ruleValue,
        notes: item.notes
      }))
    };
  }

  async getProductForConfigurator(filters = {}) {
    const products = await this.productRepository.listProducts(filters);
    const codes = products.map((p) => p.code);
    const pricingRows = await this.productRepository.findPricingByCodes(codes);
    const pricingMap = new Map(pricingRows.map((p) => [p.product_code, p]));

    return {
      filters: {
        type: filters.type || null,
        status: filters.status || null,
        requiresFoundation:
          typeof filters.requiresFoundation === "boolean"
            ? filters.requiresFoundation
            : null
      },
      products: products.map((product) => {
        const pricing = pricingMap.get(product.code);
        return {
          id: product.id,
          code: product.code,
          type: product.type,
          name: product.name,
          status: product.status,
          version: product.version,
          requiresFoundation: product.requiresFoundation,
          finalInstalledPrice: Number(product.finalInstalledPrice || 0),
          pricingSummary: pricing
            ? {
                materialCost: Number(pricing.material_cost || 0),
                labourCost: Number(pricing.labour_cost || 0),
                directCost: Number(pricing.direct_cost || 0),
                installedPrice: Number(pricing.installed_price || 0),
                grossProfit: Number(pricing.gross_profit || 0),
                grossMargin: Number(pricing.gross_margin || 0)
              }
            : null
        };
      })
    };
  }

  async getProductForAIContext(productCode) {
    const card = await this.getProductCardByCode(productCode);
    if (!card) return null;
    const { product, pricing } = card;

    return {
      productCode: product.code,
      productName: product.name,
      productType: product.type,
      status: product.status,
      version: product.version,
      requiresFoundation: product.requiresFoundation,
      narrative: {
        coreValue: product.coreValue,
        primaryEmotion: product.primaryEmotion,
        subtitle: product.subtitle,
        story: product.story
      },
      capabilities: product.capabilities.map((item) => ({
        capability: item.capability,
        includedQty: item.includedQty === null ? null : Number(item.includedQty),
        customerLayer: item.customerLayer
      })),
      experiences: product.experiences.map((item) => ({
        sequence: item.sequence,
        title: item.title,
        description: item.description
      })),
      automation: product.automations.map((item) => ({
        key: item.automationKey,
        sequence: item.sequence,
        title: item.title,
        description: item.description,
        triggerType: item.triggerType,
        status: item.status
      })),
      rules: product.rules.map((item) => ({
        key: item.ruleKey,
        value: item.ruleValue
      })),
      pricing: pricing
        ? {
            installedPrice: Number(pricing.installed_price || 0),
            directCost: Number(pricing.direct_cost || 0),
            grossMargin: Number(pricing.gross_margin || 0)
          }
        : null
    };
  }

  async listCatalog(filters = {}) {
    return this.productRepository.listProducts(filters);
  }

  async logVersionChange({
    productId,
    changedBy,
    changeType,
    changeSummary,
    previousVersion,
    newVersion,
    metadata
  }) {
    return this.productRepository.createChangeLog({
      productId,
      changedBy,
      changeType,
      changeSummary,
      previousVersion,
      newVersion,
      metadata
    });
  }
}

module.exports = { ProductService };
