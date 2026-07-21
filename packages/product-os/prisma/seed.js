const { PrismaClient, ProductType, RecordStatus } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  await prisma.setting.upsert({
    where: { settingKey: "loaded_labour_rate" },
    update: { numericValue: "120.00", textValue: "AUD per hour" },
    create: {
      settingKey: "loaded_labour_rate",
      numericValue: "120.00",
      textValue: "AUD per hour",
      notes: "Default loaded labour rate used by pricing view."
    }
  });

  await prisma.setting.upsert({
    where: { settingKey: "gst" },
    update: { numericValue: "0.10", textValue: "10%" },
    create: {
      settingKey: "gst",
      numericValue: "0.10",
      textValue: "10%",
      notes: "Australia GST rate."
    }
  });

  await prisma.setting.upsert({
    where: { settingKey: "working_hours_per_day" },
    update: { numericValue: "7.60" },
    create: {
      settingKey: "working_hours_per_day",
      numericValue: "7.60",
      notes: "Standard productive install hours per day."
    }
  });

  await prisma.setting.upsert({
    where: { settingKey: "company_overhead" },
    update: { numericValue: "0.15", textValue: "15%" },
    create: {
      settingKey: "company_overhead",
      numericValue: "0.15",
      textValue: "15%",
      notes: "Default overhead ratio for reporting use."
    }
  });

  const products = [
    {
      code: "FOUNDATION",
      type: ProductType.INFRASTRUCTURE,
      name: "Foundation",
      finalInstalledPrice: "4999.00",
      requiresFoundation: false
    },
    {
      code: "LIVING",
      type: ProductType.COLLECTION,
      name: "Living",
      finalInstalledPrice: "2999.00",
      requiresFoundation: true
    },
    {
      code: "ENTRY",
      type: ProductType.COLLECTION,
      name: "Entry",
      finalInstalledPrice: "2499.00",
      requiresFoundation: true
    },
    {
      code: "KITCHEN",
      type: ProductType.COLLECTION,
      name: "Kitchen",
      finalInstalledPrice: "2499.00",
      requiresFoundation: true
    },
    {
      code: "BEDROOM",
      type: ProductType.COLLECTION,
      name: "Bedroom",
      finalInstalledPrice: "2699.00",
      requiresFoundation: true
    },
    {
      code: "BATHROOM",
      type: ProductType.COLLECTION,
      name: "Bathroom",
      finalInstalledPrice: "2199.00",
      requiresFoundation: true
    },
    {
      code: "AWAY",
      type: ProductType.COLLECTION,
      name: "Away",
      finalInstalledPrice: "2499.00",
      requiresFoundation: true
    }
  ];

  for (const product of products) {
    await prisma.productCatalog.upsert({
      where: { code: product.code },
      update: {
        type: product.type,
        name: product.name,
        version: "1.0",
        status: RecordStatus.FROZEN,
        finalInstalledPrice: product.finalInstalledPrice,
        requiresFoundation: product.requiresFoundation
      },
      create: {
        code: product.code,
        type: product.type,
        name: product.name,
        version: "1.0",
        status: RecordStatus.FROZEN,
        finalInstalledPrice: product.finalInstalledPrice,
        requiresFoundation: product.requiresFoundation,
        coreValue: "Better Home Product OS seed record"
      }
    });
  }

  console.log("Seed complete for Better Home Product OS.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
