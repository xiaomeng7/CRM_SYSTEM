const { prisma } = require("./prisma-client");
const { ProductRepository } = require("./repositories/product-repository");
const { ProductService } = require("./services/product-service");

function createProductOsContext({ prismaClient } = {}) {
  const client = prismaClient || prisma;
  const productRepository = new ProductRepository(client);
  const productService = new ProductService({ productRepository });

  return {
    prisma: client,
    repositories: {
      productRepository
    },
    services: {
      productService
    }
  };
}

module.exports = {
  prisma,
  createProductOsContext,
  ProductRepository,
  ProductService
};
