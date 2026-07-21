/**
 * Product OS V2 environment / target identity guard.
 * Never prints connection strings, usernames, passwords, or query parameters.
 * Does not connect to any database by itself.
 */

const crypto = require("crypto");

const ALLOWED_ENVS = Object.freeze(["local", "neon_dev", "production"]);
const ALLOWED_MODES = Object.freeze(["preflight", "status", "deploy"]);

const URL_ENV_BY_TARGET = Object.freeze({
  local: "PRODUCT_OS_LOCAL_DATABASE_URL",
  neon_dev: "PRODUCT_OS_DEV_DATABASE_URL",
  production: "PRODUCT_OS_PROD_DATABASE_URL"
});

const FINGERPRINT_ENV_BY_TARGET = Object.freeze({
  local: "PRODUCT_OS_LOCAL_HOST_FINGERPRINT",
  neon_dev: "PRODUCT_OS_DEV_HOST_FINGERPRINT",
  production: "PRODUCT_OS_PROD_HOST_FINGERPRINT"
});

/** Exact second confirmation value required for production deploy. */
const PRODUCTION_CONFIRM_VALUE = "DEPLOY_PRODUCT_OS_TO_PRODUCTION";

/**
 * Parse a postgres URL into non-secret identity parts.
 * Returns null if unparseable.
 */
function parseDbIdentity(urlString) {
  if (!urlString || typeof urlString !== "string") return null;
  try {
    const normalized = urlString.replace(/^postgres(ql)?:/i, "http:");
    const u = new URL(normalized);
    const host = (u.hostname || "").toLowerCase();
    const port = u.port || "5432";
    const database = decodeURIComponent((u.pathname || "/").replace(/^\//, "") || "").toLowerCase();
    if (!host || !database) return null;
    return { host, port, database };
  } catch {
    return null;
  }
}

/**
 * Cryptographic fingerprint of non-secret DB identity (host|port|database).
 * SHA-256 hex. Does not include user, password, or query string.
 */
function computeHostFingerprint(urlString) {
  const identity = parseDbIdentity(urlString);
  if (!identity) return null;
  const material = `host=${identity.host}|port=${identity.port}|db=${identity.database}`;
  return crypto.createHash("sha256").update(material, "utf8").digest("hex");
}

/** @deprecated alias kept for older call sites — now cryptographic */
function fingerprintHost(urlString) {
  const fp = computeHostFingerprint(urlString);
  return fp ? `sha256:${fp}` : "sha256:unparseable";
}

function resolveDatabaseUrlForEnv(envName, env = process.env) {
  const key = URL_ENV_BY_TARGET[envName];
  if (!key) return null;
  const value = env[key];
  if (!value || !String(value).trim()) return null;
  return String(value).trim();
}

function expectedFingerprintForEnv(envName, env = process.env) {
  const key = FINGERPRINT_ENV_BY_TARGET[envName];
  if (!key) return null;
  const value = env[key];
  if (!value || !String(value).trim()) return null;
  return String(value).trim().toLowerCase().replace(/^sha256:/, "");
}

function identitiesEqual(urlA, urlB) {
  const a = parseDbIdentity(urlA);
  const b = parseDbIdentity(urlB);
  if (!a || !b) return false;
  return a.host === b.host && a.port === b.port && a.database === b.database;
}

function assertDevProdNotSame(env = process.env) {
  const dev = resolveDatabaseUrlForEnv("neon_dev", env);
  const prod = resolveDatabaseUrlForEnv("production", env);
  if (dev && prod && identitiesEqual(dev, prod)) {
    const err = new Error(
      "PRODUCT_OS_DEV_DATABASE_URL and PRODUCT_OS_PROD_DATABASE_URL resolve to the same database identity. Refusing."
    );
    err.code = "PRODUCT_OS_DEV_PROD_COLLISION";
    throw err;
  }
}

/**
 * Full target gate for Product OS V2 DB operations.
 */
function assertProductOsDatabaseTarget({
  envName,
  productionConfirmed = false,
  productionConfirmValue = null,
  requireFingerprint = true,
  requireUrl = false,
  env = process.env
} = {}) {
  if (!envName || !ALLOWED_ENVS.includes(envName)) {
    const err = new Error(
      `Explicit --env target required. Allowed: ${ALLOWED_ENVS.join(", ")}.`
    );
    err.code = "PRODUCT_OS_ENV_REQUIRED";
    throw err;
  }

  // Never use root DATABASE_URL as Product OS target.
  if (env.DATABASE_URL && !resolveDatabaseUrlForEnv(envName, env)) {
    // Presence of root URL alone is fine; missing Product OS URL is the failure when required.
  }

  assertDevProdNotSame(env);

  if (envName === "production") {
    if (productionConfirmed !== true) {
      const err = new Error(
        "Production target refused. Supply --i-understand-production."
      );
      err.code = "PRODUCT_OS_PRODUCTION_REFUSED";
      throw err;
    }
    const confirm =
      productionConfirmValue ||
      env.PRODUCT_OS_PRODUCTION_CONFIRM ||
      null;
    if (confirm !== PRODUCTION_CONFIRM_VALUE) {
      const err = new Error(
        `Production target refused. Second confirmation must equal exact value via --confirm-production or PRODUCT_OS_PRODUCTION_CONFIRM.`
      );
      err.code = "PRODUCT_OS_PRODUCTION_CONFIRM_MISSING";
      throw err;
    }
  }

  const url = resolveDatabaseUrlForEnv(envName, env);
  if (requireUrl && !url) {
    const err = new Error(
      `Missing ${URL_ENV_BY_TARGET[envName]} for target "${envName}". Root DATABASE_URL is never used as a Product OS target. Local does not fall back to dev.`
    );
    err.code = "PRODUCT_OS_URL_MISSING";
    throw err;
  }

  let computedFingerprint = url ? computeHostFingerprint(url) : null;
  const expectedFingerprint = expectedFingerprintForEnv(envName, env);

  // neon_dev and production always require approved fingerprint when URL is present or when connecting.
  const fingerprintMandatory =
    requireFingerprint &&
    (envName === "neon_dev" || envName === "production" || Boolean(expectedFingerprint));

  if (fingerprintMandatory) {
    if (!expectedFingerprint) {
      const err = new Error(
        `Missing approved host fingerprint env ${FINGERPRINT_ENV_BY_TARGET[envName]} for target "${envName}". Capture during Phase 3B preflight.`
      );
      err.code = "PRODUCT_OS_FINGERPRINT_MISSING";
      throw err;
    }
    if (url && computedFingerprint !== expectedFingerprint) {
      const err = new Error(
        `Host fingerprint mismatch for target "${envName}". Expected fingerprint does not match selected Product OS URL identity. Fail closed.`
      );
      err.code = "PRODUCT_OS_FINGERPRINT_MISMATCH";
      throw err;
    }
  }

  return {
    ok: true,
    envName,
    urlEnvVar: URL_ENV_BY_TARGET[envName],
    hostFingerprint: computedFingerprint ? `sha256:${computedFingerprint}` : null,
    expectedFingerprint: expectedFingerprint ? `sha256:${expectedFingerprint}` : null,
    hasUrl: Boolean(url)
  };
}

function parseCliArgs(argv = process.argv.slice(2)) {
  let envName = null;
  let mode = "preflight";
  let productionConfirmed = false;
  let productionConfirmValue = null;
  let executeApprovedMigration = false;

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--") {
      continue;
    }
    if (a === "--env" || a === "--product-os-env") {
      envName = argv[++i] || null;
    } else if (a.startsWith("--env=")) {
      envName = a.slice("--env=".length);
    } else if (a === "--mode") {
      mode = argv[++i] || null;
    } else if (a.startsWith("--mode=")) {
      mode = a.slice("--mode=".length);
    } else if (a === "--i-understand-production") {
      productionConfirmed = true;
    } else if (a === "--confirm-production") {
      productionConfirmValue = argv[++i] || null;
    } else if (a.startsWith("--confirm-production=")) {
      productionConfirmValue = a.slice("--confirm-production=".length);
    } else if (a === "--execute-approved-migration") {
      executeApprovedMigration = true;
    } else if (a === "--help" || a === "-h") {
      // ignore — runner prints usage
    } else {
      const err = new Error(`Unrecognized or disallowed argument: ${a}`);
      err.code = "PRODUCT_OS_ARGS_REJECTED";
      throw err;
    }
  }

  if (mode && !ALLOWED_MODES.includes(mode)) {
    const err = new Error(`Invalid --mode. Allowed: ${ALLOWED_MODES.join(", ")}`);
    err.code = "PRODUCT_OS_MODE_INVALID";
    throw err;
  }

  return {
    envName,
    mode,
    productionConfirmed,
    productionConfirmValue,
    executeApprovedMigration
  };
}

/** @deprecated use parseCliArgs */
function parseCliEnvArgs(argv) {
  const parsed = parseCliArgs(argv);
  return {
    envName: parsed.envName,
    productionConfirmed: parsed.productionConfirmed
  };
}

function buildSanitizedChildEnv({
  selectedUrl,
  env = process.env
} = {}) {
  const childEnv = { ...env };
  // Remove ambient DB URL variables so Prisma cannot pick the wrong one.
  delete childEnv.DATABASE_URL;
  delete childEnv.DATABASE_PRIVATE_URL;
  delete childEnv.POSTGRES_URL;
  delete childEnv.POSTGRES_PRISMA_URL;
  delete childEnv.POSTGRES_URL_NON_POOLING;
  delete childEnv.PRODUCT_OS_LOCAL_DATABASE_URL;
  delete childEnv.PRODUCT_OS_DEV_DATABASE_URL;
  delete childEnv.PRODUCT_OS_PROD_DATABASE_URL;
  // Selected URL only for the child process.
  childEnv.DATABASE_URL = selectedUrl;
  return childEnv;
}

function assertOutputHasNoSecrets(text, urls = []) {
  const hay = String(text || "");
  for (const url of urls.filter(Boolean)) {
    if (hay.includes(url)) {
      const err = new Error("Refusing to emit output that contains a database URL.");
      err.code = "PRODUCT_OS_SECRET_LEAK";
      throw err;
    }
    try {
      const normalized = url.replace(/^postgres(ql)?:/i, "http:");
      const u = new URL(normalized);
      if (u.password && hay.includes(u.password)) {
        const err = new Error("Refusing to emit output that contains a database password.");
        err.code = "PRODUCT_OS_SECRET_LEAK";
        throw err;
      }
      if (u.username && u.username.length > 1 && hay.includes(u.username)) {
        const err = new Error("Refusing to emit output that contains a database username.");
        err.code = "PRODUCT_OS_SECRET_LEAK";
        throw err;
      }
    } catch (e) {
      if (e.code === "PRODUCT_OS_SECRET_LEAK") throw e;
    }
  }
}

module.exports = {
  ALLOWED_ENVS,
  ALLOWED_MODES,
  URL_ENV_BY_TARGET,
  FINGERPRINT_ENV_BY_TARGET,
  PRODUCTION_CONFIRM_VALUE,
  parseDbIdentity,
  computeHostFingerprint,
  fingerprintHost,
  resolveDatabaseUrlForEnv,
  expectedFingerprintForEnv,
  identitiesEqual,
  assertDevProdNotSame,
  assertProductOsDatabaseTarget,
  parseCliArgs,
  parseCliEnvArgs,
  buildSanitizedChildEnv,
  assertOutputHasNoSecrets
};
