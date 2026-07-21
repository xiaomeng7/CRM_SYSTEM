/**
 * Stable business-code formats for Product OS V2 (ISSUE-021 / ADR-010).
 * Does not assign final source-data IDs in Phase 3A.
 */

const CODE_PATTERNS = Object.freeze({
  product: /^(F|C|E|AO)-\d{2,}([A-Z0-9-]*)$/i,
  experience: /^exp\.[a-z0-9][a-z0-9_.-]*$/i,
  capability: /^cap\.[a-z0-9][a-z0-9_.-]*$/i,
  relationship: /^rel\.[a-z0-9][a-z0-9_.-]*$/i,
  rule: /^rule\.[a-z0-9][a-z0-9_.-]*$/i,
  automation: /^auto\.[a-z0-9][a-z0-9_.-]*$/i,
  content: /^cnt\.[a-z0-9][a-z0-9_.-]*$/i,
  asset: /^asset\.[a-z0-9][a-z0-9_.-]*$/i,
  scopeGroup: /^scp\.grp\.[a-z0-9][a-z0-9_.-]*$/i,
  scopeItem: /^scp\.item\.[a-z0-9][a-z0-9_.-]*$/i,
  priceBook: /^pb\.[a-z0-9][a-z0-9_.-]*$/i,
  price: /^price\.[a-z0-9][a-z0-9_.-]*$/i,
  release: /^pos-[0-9]+\.[0-9]+$/i,
  bomVersion: /^bom\.[a-z0-9][a-z0-9_.-]*$/i,
  labour: /^lab\.[a-z0-9][a-z0-9_.-]*$/i,
  assumption: /^asm\.[a-z0-9][a-z0-9_.-]*$/i,
  mapping: /^map\.[a-z0-9][a-z0-9_.-]*$/i,
  theme: /^theme\.[a-z0-9][a-z0-9_.-]*$/i
});

function normalizeStableCode(code) {
  if (code == null) return null;
  return String(code).trim().toLowerCase();
}

function normalizeProductCode(code) {
  if (code == null) return null;
  const raw = String(code).trim().toUpperCase();
  return raw;
}

function isValidStableCode(kind, code) {
  const pattern = CODE_PATTERNS[kind];
  if (!pattern) return false;
  if (kind === "product") {
    return pattern.test(String(code || "").trim());
  }
  if (kind === "release") {
    return pattern.test(String(code || "").trim().toLowerCase());
  }
  return pattern.test(normalizeStableCode(code) || "");
}

function assertNoExcelRowIdentity(candidate) {
  if (candidate == null) return true;
  const s = String(candidate).trim();
  if (/^row[-_]?\d+$/i.test(s)) {
    return false;
  }
  if (/^\d+$/.test(s)) {
    return false;
  }
  return true;
}

module.exports = {
  CODE_PATTERNS,
  normalizeStableCode,
  normalizeProductCode,
  isValidStableCode,
  assertNoExcelRowIdentity
};
