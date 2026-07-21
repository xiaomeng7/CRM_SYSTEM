const { PrismaClient } = require("@prisma/client");
const { assertProductOsDatabaseTarget, resolveDatabaseUrlForEnv } = require("./env-guard");
const { createProductReadRepository } = require("./product-read-repository");
const { createProductReadService } = require("./product-read-service");

function resolveRuntimeEnvironment(explicitEnvName) {
  if (explicitEnvName) return explicitEnvName;

  const configuredEnvName = String(process.env.PRODUCT_OS_DATABASE_ENV || "").trim();
  if (configuredEnvName) return configuredEnvName;

  if (process.env.NODE_ENV === "production") {
    throw new Error("PRODUCT_OS_DATABASE_ENV is required in production.");
  }

  return "neon_dev";
}

function createProductOsV2ReadContext({ envName } = {}) {
  envName = resolveRuntimeEnvironment(envName);
  assertProductOsDatabaseTarget({ envName, requireUrl: true, requireFingerprint: true });
  const prisma = new PrismaClient({ datasourceUrl: resolveDatabaseUrlForEnv(envName) });
  const repository = createProductReadRepository(prisma);
  return { prisma, repository, service: createProductReadService(repository), async disconnect(){ await prisma.$disconnect(); } };
}

module.exports={createProductOsV2ReadContext,resolveRuntimeEnvironment};
