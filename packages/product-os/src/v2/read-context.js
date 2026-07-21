const { PrismaClient } = require("@prisma/client");
const { assertProductOsDatabaseTarget, resolveDatabaseUrlForEnv } = require("./env-guard");
const { createProductReadRepository } = require("./product-read-repository");
const { createProductReadService } = require("./product-read-service");

function createProductOsV2ReadContext({ envName = "neon_dev" } = {}) {
  assertProductOsDatabaseTarget({ envName, requireUrl: true, requireFingerprint: true });
  const prisma = new PrismaClient({ datasourceUrl: resolveDatabaseUrlForEnv(envName) });
  const repository = createProductReadRepository(prisma);
  return { prisma, repository, service: createProductReadService(repository), async disconnect(){ await prisma.$disconnect(); } };
}

module.exports={createProductOsV2ReadContext};
