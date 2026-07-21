/**
 * Remap product-code references in slash-delimited / free-text fields (Phase 4A).
 * Pure: Legacy workbook codes → canonical codes per DEC-013.
 */

const {
  normalizeProductCode,
  toCanonicalProductCode,
  resolveLegacyAlias
} = require("../legacy-crosswalk");

const PRODUCT_CODE_TOKEN = /\b([FCE]-\d{2}|AO-\d{3})\b/gi;

/**
 * Split parent eligibility like "C-01/C-02/E-06" into tokens, remap each.
 * Tokens that resolve to benefits (Legacy E-05 Protection) are dropped with a warning.
 * Uses crosswalk by code (not name) so bare E-05 is never treated as a product parent.
 */
function remapParentEligibility(raw) {
  if (raw == null || String(raw).trim() === "") {
    return { codes: [], dropped: [], warnings: [] };
  }
  const parts = String(raw)
    .split(/[/,|;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const codes = [];
  const dropped = [];
  const warnings = [];
  const seen = new Set();

  for (const part of parts) {
    const legacy = normalizeProductCode(part);
    const alias = resolveLegacyAlias(legacy);
    if (alias && alias.resolutionKind === "INCLUDED_BENEFIT") {
      dropped.push({ legacyCode: legacy, reason: "INCLUDED_BENEFIT" });
      warnings.push(`Dropped parent eligibility ${part}: Protection is not a product`);
      continue;
    }
    const canonical =
      alias && alias.resolutionKind === "PRODUCT"
        ? alias.canonicalProductCode
        : toCanonicalProductCode(legacy) || legacy;
    if (!canonical) {
      dropped.push({ legacyCode: legacy, reason: "UNRESOLVED" });
      continue;
    }
    const key = normalizeProductCode(canonical);
    if (!seen.has(key)) {
      seen.add(key);
      codes.push(key);
    }
  }
  return { codes, dropped, warnings };
}

/**
 * Replace product-code tokens in arbitrary text with canonical codes.
 * Does not invent content — only identity rewrite.
 */
function remapProductCodeTokensInText(text) {
  if (text == null) return { text: null, replacements: [] };
  const replacements = [];
  const out = String(text).replace(PRODUCT_CODE_TOKEN, (match) => {
    const upper = normalizeProductCode(match);
    const canonical = toCanonicalProductCode(upper);
    if (canonical == null) {
      replacements.push({ from: upper, to: null, kind: "BENEFIT_OR_WITHDRAWN" });
      return match; // leave token; consumer must not treat as product FK
    }
    if (canonical !== upper) {
      replacements.push({ from: upper, to: canonical, kind: "REMAP" });
      return canonical;
    }
    return match;
  });
  return { text: out, replacements };
}

module.exports = {
  PRODUCT_CODE_TOKEN,
  remapParentEligibility,
  remapProductCodeTokensInText
};
