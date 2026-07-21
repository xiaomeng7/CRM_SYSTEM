/**
 * Canonical JSON serialization + deterministic ImportPlan hashing (Phase 4A.1).
 */

const crypto = require("crypto");

const NON_DETERMINISTIC_KEYS = new Set([
  "generated_at",
  "absolutePath",
  "sourceDir",
  "workingDirectory",
  "tmpdir",
  "timestamp"
]);

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (NON_DETERMINISTIC_KEYS.has(key)) continue;
    out[key] = sortKeysDeep(value[key]);
  }
  return out;
}

/** Sort entity arrays by stable identity fields for order-independence. */
function canonicalizeImportPlan(plan) {
  const clone = sortKeysDeep(plan);
  const arraySortKeys = {
    products: (a) => a.productCode,
    addons: (a) => a.productCode,
    prices: (a) => a.productCode,
    aliases: (a) => `${a.legacyCode}:${a.resolutionKind}`,
    includedBenefits: (a) => a.benefitCode,
    experiences: (a) => a.experienceCode,
    capabilities: (a) => a.capabilityCode,
    bomItems: (a) => a.bomItemCode,
    labourApplications: (a) => a.labourApplicationCode,
    rules: (a) => a.ruleCode,
    automations: (a) => a.automationCode,
    contentEntries: (a) => a.contentCode,
    themes: (a) => a.themeCode,
    assets: (a) => a.assetCode,
    icons: (a) => a.iconCode,
    layouts: (a) => a.layoutCode,
    settings: (a) => a.parameter,
    labourLibrary: (a) => a.labourCode,
    skus: (a) => a.skuCode,
    skippedActions: (a) => `${a.sheet}:${a.sourceRow}:${a.stableSourceReference}:${a.reasonCode}`,
    plannedActions: (a) => JSON.stringify(a),
    decisionDeltas: (a) => a.ref || a.benefitCode,
    warnings: (a) => a
  };
  for (const [key, sorter] of Object.entries(arraySortKeys)) {
    if (Array.isArray(clone[key])) {
      clone[key] = [...clone[key]].sort((a, b) => {
        const sa = typeof a === "string" ? a : sorter(a);
        const sb = typeof b === "string" ? b : sorter(b);
        return String(sa).localeCompare(String(sb));
      });
    }
  }
  return clone;
}

function serializeCanonical(plan) {
  return `${JSON.stringify(canonicalizeImportPlan(plan))}\n`;
}

function hashImportPlan(plan) {
  const body = serializeCanonical(plan);
  return crypto.createHash("sha256").update(body).digest("hex");
}

function runDeterminismCheck(buildFn, times = 3) {
  const hashes = [];
  let lastPlan = null;
  for (let i = 0; i < times; i += 1) {
    lastPlan = buildFn();
    hashes.push(hashImportPlan(lastPlan));
  }
  const identical = hashes.every((h) => h === hashes[0]);
  return {
    hashes,
    identical,
    deterministic_hash: hashes[0],
    hasGeneratedUuid: JSON.stringify(lastPlan).includes('"uuid"'),
    plan: lastPlan
  };
}

module.exports = {
  NON_DETERMINISTIC_KEYS,
  sortKeysDeep,
  canonicalizeImportPlan,
  serializeCanonical,
  hashImportPlan,
  runDeterminismCheck
};
