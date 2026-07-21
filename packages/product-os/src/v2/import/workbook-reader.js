/**
 * Read-only V2.07 workbook sheet reader (Phase 4A).
 * Does not write to any database.
 */

const XLSX = require("xlsx");

const EXPECTED_SHEETS = Object.freeze([
  "00_ReadMe",
  "01_Settings",
  "02_Labour_Library",
  "03_SKU_Master",
  "04_Product_Master",
  "05_Product_Experiences",
  "06_Product_Capabilities",
  "07_Product_BOM",
  "08_Product_Labour",
  "09_Product_Rules",
  "10_Pricing_Summary",
  "11_Add_Ons",
  "12_Product_Card_Content",
  "13_Roadmap",
  "14_Content_Library",
  "15_Icon_Library",
  "16_Image_Library",
  "17_Theme_Library",
  "18_Layout_Config",
  "19_Automation_Library",
  "20_Product_Review",
  "CHANGELOG"
]);

const LEGACY_SHEETS = Object.freeze(["12_Product_Card_Content"]);

function normalizeHeader(key) {
  return String(key || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function normalizeRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[normalizeHeader(k)] = v;
  }
  return out;
}

function loadWorkbook(filePath) {
  return XLSX.readFile(filePath, { cellDates: true });
}

function listSheets(workbook) {
  return [...workbook.SheetNames];
}

function assertExpectedSheets(workbook) {
  const names = listSheets(workbook);
  const missing = EXPECTED_SHEETS.filter((s) => !names.includes(s));
  const unexpected = names.filter((s) => !EXPECTED_SHEETS.includes(s));
  return {
    ok: missing.length === 0,
    missing,
    unexpected,
    sheetNames: names
  };
}

function readSheetRows(workbook, sheetName, { allowMissing = false } = {}) {
  if (LEGACY_SHEETS.includes(sheetName)) {
    return {
      sheetName,
      legacy: true,
      authoritative: false,
      rows: [],
      skippedReason: "LEGACY_NON_AUTHORITATIVE"
    };
  }
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    if (allowMissing) {
      return { sheetName, legacy: false, authoritative: true, rows: [], skippedReason: "MISSING" };
    }
    const err = new Error(`Missing workbook sheet: ${sheetName}`);
    err.code = "PRODUCT_OS_SHEET_MISSING";
    throw err;
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null }).map(normalizeRow);
  return {
    sheetName,
    legacy: false,
    authoritative: true,
    rows,
    skippedReason: null
  };
}

function pick(row, keys, fallback = null) {
  for (const key of keys) {
    const v = row[key];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return fallback;
}

function asString(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value).trim();
}

module.exports = {
  EXPECTED_SHEETS,
  LEGACY_SHEETS,
  normalizeHeader,
  normalizeRow,
  loadWorkbook,
  listSheets,
  assertExpectedSheets,
  readSheetRows,
  pick,
  asString
};
