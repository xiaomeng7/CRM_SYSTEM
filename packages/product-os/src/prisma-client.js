const { PrismaClient } = require("@prisma/client");

let prisma;

if (!global.__productOsPrismaClient) {
  global.__productOsPrismaClient = new PrismaClient();
}

prisma = global.__productOsPrismaClient;

module.exports = { prisma };
