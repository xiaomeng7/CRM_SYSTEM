/**
 * Immutable Product OS source fingerprint verification (Phase 4A).
 * Read-only filesystem. Never mutates sources.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// import/ → v2/ → src/ → product-os/ → packages/ → crm-system/
const CRM_SYSTEM_ROOT = path.join(__dirname, "../../../../..");
const SOURCE_DIR = path.join(CRM_SYSTEM_ROOT, "docs/product-os/source");

const APPROVED_SOURCES = Object.freeze([
  {
    relativePath: "Better_Home_Product_Database_V2.07.xlsx",
    sha256: "5e6bd55401f2ba0df37d60aa5cd52ccf3129c822dffd80c40d0fe10da4ca620f",
    role: "workbook_facts"
  },
  {
    relativePath: "A4_Content_Mapping_Review_V1.md",
    sha256: "a68587aadff15df830b570ee5d83a30db7c3e1b398623980455e217c663b77a8",
    role: "a4_mapping_review"
  },
  {
    relativePath: "Better_Home_Collections_A4_Review_Set_V1.pdf",
    sha256: "f16c53443b49d71478732fb94dbb0bcc85a5968e645f286167e918f47123fff8",
    role: "a4_review_pdf"
  }
]);

function sha256File(absPath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(absPath));
  return hash.digest("hex");
}

function verifyApprovedSources({ sourceDir = SOURCE_DIR } = {}) {
  const results = [];
  let ok = true;
  for (const src of APPROVED_SOURCES) {
    const abs = path.join(sourceDir, src.relativePath);
    const exists = fs.existsSync(abs);
    const actual = exists ? sha256File(abs) : null;
    const match = exists && actual === src.sha256;
    if (!match) ok = false;
    results.push({
      ...src,
      absolutePath: abs,
      exists,
      actualSha256: actual,
      match
    });
  }
  return { ok, sourceDir, results };
}

module.exports = {
  SOURCE_DIR,
  APPROVED_SOURCES,
  sha256File,
  verifyApprovedSources
};
